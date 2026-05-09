const { query } = require("../config/db");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");

function inferMimeFromFileName(fileName, storedMime) {
  const m = String(storedMime || "").trim().toLowerCase();
  if (m && m !== "application/octet-stream") return m;
  const ext = path.extname(String(fileName || "")).slice(1).toLowerCase();
  const map = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    svg: "image/svg+xml",
    tif: "image/tiff",
    tiff: "image/tiff",
    txt: "text/plain",
    csv: "text/csv",
    json: "application/json",
    xml: "application/xml",
    html: "text/html",
    htm: "text/html",
    md: "text/markdown",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    m4a: "audio/mp4",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  };
  return map[ext] || storedMime || "application/octet-stream";
}

async function buildMergedPdf(files) {
  const merged = await PDFDocument.create();

  for (const file of files) {
    const mime = String(file.mimetype || "").toLowerCase();
    const bytes = fs.readFileSync(file.path);

    if (mime === "application/pdf") {
      const source = await PDFDocument.load(bytes);
      const pages = await merged.copyPages(source, source.getPageIndices());
      pages.forEach((page) => merged.addPage(page));
      continue;
    }

    const page = merged.addPage([595.28, 841.89]);
    if (mime === "image/png") {
      const image = await merged.embedPng(bytes);
      const scaled = image.scale(Math.min(500 / image.width, 700 / image.height, 1));
      page.drawImage(image, { x: 48, y: 120, width: scaled.width, height: scaled.height });
      continue;
    }

    if (mime === "image/jpeg" || mime === "image/jpg") {
      const image = await merged.embedJpg(bytes);
      const scaled = image.scale(Math.min(500 / image.width, 700 / image.height, 1));
      page.drawImage(image, { x: 48, y: 120, width: scaled.width, height: scaled.height });
      continue;
    }

    // Unsupported mime for merge: include marker page with filename.
    page.drawText(`Unsupported file included: ${file.originalname}`, { x: 48, y: 760, size: 12 });
  }

  return Buffer.from(await merged.save());
}

async function uploadDocument(req, res, next) {
  try {
    const single = req.files?.file?.[0] || null;
    const multiple = Array.isArray(req.files?.files) ? req.files.files : [];
    const allFiles = [single, ...multiple].filter(Boolean);

    if (!allFiles.length) return res.status(400).json({ message: "File is required" });

    const { booking_id, doc_type, exporter_id, doc_name_pattern, awb_code } = req.body;
    let linkedExporterId = exporter_id ? Number(exporter_id) : req.user.linked_exporter_id;

    if (req.user.role === "clearing_agent" || req.user.role === "exporter") {
      // Clearing agents can explicitly select exporter; otherwise use linked exporter
      linkedExporterId = exporter_id ? Number(exporter_id) : req.user.linked_exporter_id;
    }

    if (!linkedExporterId) {
      return res.status(400).json({ message: "Exporter account is required" });
    }

    let savedFileName = allFiles[0].originalname;
    let savedFilePath = allFiles[0].path;
    let savedMime = allFiles[0].mimetype;
    let savedSize = Number(allFiles[0].size || 0);

    // Merge uploaded files into one PDF when more than one document is provided.
    if (allFiles.length > 1) {
      const mergedPdf = await buildMergedPdf(allFiles);
      const uploadsDir = path.join(process.cwd(), "uploads");
      const mergedName = `${Date.now()}-${(doc_name_pattern || "merged-document").replace(/\s+/g, "_")}.pdf`;
      const mergedPath = path.join(uploadsDir, mergedName);
      fs.writeFileSync(mergedPath, mergedPdf);

      savedFileName = mergedName;
      savedFilePath = mergedPath;
      savedMime = "application/pdf";
      savedSize = mergedPdf.length;
    }

    const result = await query(
      `INSERT INTO documents
      (exporter_id, uploaded_by, booking_id, doc_type, doc_name_pattern, awb_code, file_name, file_path, mime_type, size_bytes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        linkedExporterId,
        req.user.id,
        booking_id || null,
        doc_type || "other",
        doc_name_pattern || null,
        awb_code || null,
        savedFileName,
        savedFilePath,
        savedMime,
        savedSize
      ]
    );

    return res.status(201).json({
      id: result.insertId,
      message: allFiles.length > 1 ? "Documents merged and uploaded" : "Document uploaded",
      awb_code,
      doc_name_pattern,
      merged_count: allFiles.length
    });
  } catch (error) {
    return next(error);
  }
}

async function listDocuments(req, res, next) {
  try {
    let sql = `
      SELECT d.id, d.exporter_id, d.booking_id, d.doc_type, d.doc_name_pattern, d.awb_code, d.file_name, d.file_path, d.mime_type, d.size_bytes, d.created_at, e.name AS exporter_name
      FROM documents d
      LEFT JOIN exporters e ON d.exporter_id = e.id
      WHERE 1=1`;
    const params = [];

    if (req.user.role === "exporter") {
      sql += " AND d.exporter_id = ?";
      params.push(req.user.linked_exporter_id);
    } else if (req.user.role === "clearing_agent") {
      // Clearing agents can see documents for their linked exporter, or all if not linked
      if (req.user.linked_exporter_id) {
        sql += " AND d.exporter_id = ?";
        params.push(req.user.linked_exporter_id);
      }
      // If not linked to a specific exporter, they can see all documents they uploaded
      else {
        sql += " AND d.uploaded_by = ?";
        params.push(req.user.id);
      }
    }

    sql += " ORDER BY d.created_at DESC";
    const rows = await query(sql, params);
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
}

function canAccessDocument(user, doc) {
  if (!user || !doc) return false;
  const role = String(user.role || "").toLowerCase();
  if (role === "admin" || role === "airline_supervisor" || role === "airline_analyst") return true;
  if (role === "exporter") {
    return Number(doc.exporter_id) === Number(user.linked_exporter_id);
  }
  if (role === "clearing_agent") {
    if (user.linked_exporter_id && Number(doc.exporter_id) === Number(user.linked_exporter_id)) return true;
    if (Number(doc.uploaded_by) === Number(user.id)) return true;
    return false;
  }
  return false;
}

async function createShareLink(req, res, next) {
  try {
    const { id } = req.params;
    const { expires_in_hours = 24 } = req.body;

    const docs = await query(`SELECT id, exporter_id, uploaded_by FROM documents WHERE id = ? LIMIT 1`, [id]);
    if (!docs.length) return res.status(404).json({ message: "Document not found" });

    if (!canAccessDocument(req.user, docs[0])) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const token = uuidv4();
    await query(`UPDATE documents SET share_token = ?, share_expires_at = DATE_ADD(NOW(), INTERVAL ? HOUR) WHERE id = ?`, [
      token,
      Number(expires_in_hours),
      id
    ]);

    const base = process.env.APP_URL || `http://localhost:${process.env.PORT || 4000}`;
    return res.json({ share_url: `${base}/api/public/documents/${token}?disposition=inline` });
  } catch (error) {
    return next(error);
  }
}

async function getDocumentById(req, res, next) {
  try {
    const { id } = req.params;
    const rows = await query(
      `SELECT d.id, d.exporter_id, d.uploaded_by, d.booking_id, d.doc_type, d.doc_name_pattern, d.awb_code, d.file_name, d.file_path, d.mime_type, d.size_bytes, d.created_at, e.name AS exporter_name
       FROM documents d
       LEFT JOIN exporters e ON d.exporter_id = e.id
       WHERE d.id = ?
       LIMIT 1`,
      [id]
    );

    if (!rows.length) return res.status(404).json({ message: "Document not found" });
    const doc = rows[0];

    if (!canAccessDocument(req.user, doc)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    return res.json(doc);
  } catch (error) {
    return next(error);
  }
}

async function streamDocumentContent(req, res, next) {
  try {
    const { id } = req.params;
    const disposition = String(req.query.disposition || "inline").toLowerCase() === "attachment" ? "attachment" : "inline";
    const rows = await query(`SELECT id, exporter_id, uploaded_by, file_name, file_path, mime_type FROM documents WHERE id = ? LIMIT 1`, [id]);
    if (!rows.length) return res.status(404).json({ message: "Document not found" });
    const doc = rows[0];

    if (!canAccessDocument(req.user, doc)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const resolvedPath = path.isAbsolute(doc.file_path)
      ? doc.file_path
      : path.join(process.cwd(), doc.file_path);

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ message: "Stored file was not found on server" });
    }

    // Set CORS headers explicitly before sending file
    const origin = req.headers.origin || req.headers.Origin;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    
    res.setHeader("Content-Type", inferMimeFromFileName(doc.file_name, doc.mime_type));
    res.setHeader("Content-Disposition", `${disposition}; filename="${String(doc.file_name || `document-${doc.id}`).replace(/"/g, "")}"`);
    
    return res.sendFile(resolvedPath);
  } catch (error) {
    return next(error);
  }
}

async function streamPublicDocument(req, res, next) {
  try {
    const { token } = req.params;
    const disposition = String(req.query.disposition || "inline").toLowerCase() === "attachment" ? "attachment" : "inline";
    
    const rows = await query(
      `SELECT id, file_name, file_path, mime_type, share_token, share_expires_at 
       FROM documents 
       WHERE share_token = ? 
       LIMIT 1`,
      [token]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Document not found or link expired" });
    }

    const doc = rows[0];

    // Check if share link has expired
    if (doc.share_expires_at) {
      const expiresAt = new Date(doc.share_expires_at);
      if (expiresAt < new Date()) {
        return res.status(410).json({ message: "Share link has expired" });
      }
    }

    const resolvedPath = path.isAbsolute(doc.file_path)
      ? doc.file_path
      : path.join(process.cwd(), doc.file_path);

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ message: "File not found on server" });
    }

    // Set CORS headers for public access
    const origin = req.headers.origin || req.headers.Origin;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    
    res.setHeader("Content-Type", inferMimeFromFileName(doc.file_name, doc.mime_type));
    res.setHeader("Content-Disposition", `${disposition}; filename="${String(doc.file_name || `document-${doc.id}`).replace(/"/g, "")}"`);
    res.setHeader("Cache-Control", "private, max-age=3600");
    
    return res.sendFile(resolvedPath);
  } catch (error) {
    return next(error);
  }
}

module.exports = { uploadDocument, listDocuments, createShareLink, getDocumentById, streamDocumentContent, streamPublicDocument };
