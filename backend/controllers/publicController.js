const { query } = require("../config/db");
const { COMMODITIES } = require("../config/constants");
const path = require("path");

function buildMediaUrl(filePath) {
  const normalized = String(filePath || "").replace(/\\/g, "/");
  const uploadsIndex = normalized.lastIndexOf("/uploads/");
  if (uploadsIndex !== -1) {
    return `${process.env.APP_URL || `http://localhost:${process.env.PORT || 4000}`}${normalized.slice(uploadsIndex)}`;
  }

  const fileName = path.basename(normalized);
  return `${process.env.APP_URL || `http://localhost:${process.env.PORT || 4000}`}/uploads/${fileName}`;
}

async function ensureHeroMediaTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS hero_media (
      id INT AUTO_INCREMENT PRIMARY KEY,
      media_type ENUM('video', 'image') NOT NULL DEFAULT 'video',
      file_name VARCHAR(255) NOT NULL,
      file_path VARCHAR(400) NOT NULL,
      mime_type VARCHAR(120) NOT NULL,
      uploaded_by INT NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      is_muted TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await query(`ALTER TABLE hero_media MODIFY COLUMN media_type ENUM('video', 'image') NOT NULL DEFAULT 'video'`);

  try {
    await query(`ALTER TABLE hero_media ADD COLUMN is_muted TINYINT(1) NOT NULL DEFAULT 0`);
  } catch (error) {
    if (!/duplicate column|already exists/i.test(error?.message || '')) {
      // eslint-disable-next-line no-console
      console.warn('[hero_media] ensure is_muted column:', error.message);
    }
  }
}

async function getAvailability(req, res, next) {
  try {
    const { startDate, endDate, airline } = req.query;

    let sql = `
      SELECT c.id, c.airline_id, a.name AS airline, c.flight_date, c.destination,
             c.total_skids, c.total_kg, c.booked_skids, c.booked_kg,
             (c.total_skids - c.booked_skids) AS free_skids,
            (c.total_kg - c.booked_kg) AS free_kg, c.status,
            CASE WHEN DATE(c.flight_date) < CURRENT_DATE() THEN 1 ELSE 0 END AS is_closed,
            CASE WHEN DATE(c.flight_date) < CURRENT_DATE() THEN 'closed' ELSE c.status END AS availability_state
      FROM capacities c
      JOIN airlines a ON c.airline_id = a.id
      WHERE c.status <> 'draft'`;

    const params = [];
    if (startDate) {
      sql += " AND c.flight_date >= ?";
      params.push(startDate);
    }
    if (endDate) {
      sql += " AND c.flight_date <= ?";
      params.push(endDate);
    }
    if (airline) {
      sql += " AND a.name = ?";
      params.push(airline);
    }

    sql += " ORDER BY c.flight_date ASC, a.name ASC";

    const rows = await query(sql, params);
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
}

async function getAirlines(req, res, next) {
  try {
    const rows = await query(`SELECT id, name, code, from_destination FROM airlines ORDER BY name ASC`);
    let destMap = new Map();
    try {
      const dests = await query(
        `SELECT airline_id, destination, is_transit FROM airline_destinations ORDER BY destination ASC`
      );
      for (const row of dests) {
        if (!destMap.has(row.airline_id)) destMap.set(row.airline_id, []);
        destMap.get(row.airline_id).push({ destination: row.destination, is_transit: !!row.is_transit });
      }
    } catch {
      destMap = new Map();
    }
    const enriched = rows.map((row) => ({
      ...row,
      destinations: destMap.get(row.id) || []
    }));
    return res.json(enriched);
  } catch (error) {
    return next(error);
  }
}

function getCommodities(req, res) {
  return res.json(COMMODITIES);
}

async function getSharedDocument(req, res, next) {
  try {
    const { token } = req.params;
    const disposition = String(req.query.disposition || "attachment").toLowerCase() === "inline" ? "inline" : "attachment";
    const docs = await query(
      `SELECT id, file_name, file_path, mime_type, share_expires_at FROM documents WHERE share_token = ? LIMIT 1`,
      [token]
    );

    if (!docs.length) return res.status(404).json({ message: "Link not found" });

    const doc = docs[0];
    if (doc.share_expires_at && new Date(doc.share_expires_at) < new Date()) {
      return res.status(410).json({ message: "Link expired" });
    }

    const resolvedPath = require("path").isAbsolute(doc.file_path)
      ? doc.file_path
      : require("path").join(process.cwd(), doc.file_path);
    if (!require("fs").existsSync(resolvedPath)) {
      return res.status(404).json({ message: "Stored file not found" });
    }

    res.setHeader("Content-Type", doc.mime_type || "application/octet-stream");
    res.setHeader("Content-Disposition", `${disposition}; filename="${String(doc.file_name || "document").replace(/"/g, "")}"`);
    return res.sendFile(resolvedPath);
  } catch (error) {
    return next(error);
  }
}

async function getHeroMedia(req, res, next) {
  try {
    await ensureHeroMediaTable();
    const rows = await query(
      `SELECT id, media_type, file_name, file_path, mime_type, is_muted, updated_at
       FROM hero_media
       WHERE is_active = 1
       ORDER BY updated_at DESC, id DESC
       LIMIT 1`
    );

    if (!rows.length) {
      return res.json({ media: null });
    }

    const media = rows[0];
    return res.json({
      media: {
        id: media.id,
        mediaType: media.media_type,
        fileName: media.file_name,
        mimeType: media.mime_type,
        url: buildMediaUrl(media.file_path),
        isMuted: !!media.is_muted,
        updatedAt: media.updated_at
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function getDashboardSummary(req, res, next) {
  try {
    const role = String(req.params.role || "").toLowerCase();

    if (role === "exporter") {
      const [exporters, bookings, docs, availability] = await Promise.all([
        query(`SELECT id, name, contact_email, whatsapp_contact, logo_url, website FROM exporters ORDER BY id ASC LIMIT 1`),
        query(
          `SELECT b.id, b.destination, b.skids, b.tonnage_kg, b.status, b.flight_date, a.name AS airline
           FROM bookings b
           JOIN airlines a ON b.airline_id = a.id
           ORDER BY b.created_at DESC
           LIMIT 6`
        ),
        query(`SELECT doc_type, COUNT(*) count FROM documents GROUP BY doc_type ORDER BY count DESC LIMIT 6`),
        query(
          `SELECT a.name AS airline, c.destination, c.total_skids, c.total_kg, c.booked_skids, c.booked_kg, c.status
           FROM capacities c
           JOIN airlines a ON c.airline_id = a.id
           ORDER BY c.updated_at DESC
           LIMIT 5`
        )
      ]);

      return res.json({
        role: "exporter",
        summary: {
          bookingsOpen: bookings.filter((booking) => booking.status === "pending").length,
          docsUploaded: docs.reduce((total, item) => total + Number(item.count), 0),
          utilization: availability.length ? Math.round((availability.reduce((sum, item) => sum + Number(item.booked_kg || 0), 0) / Math.max(1, availability.reduce((sum, item) => sum + Number(item.total_kg || 0), 0))) * 100) : 0,
          activeExporter: exporters[0] || null
        },
        bookings,
        documents: docs,
        availability
      });
    }

    if (role === "airline") {
      const [requests, capacities, users] = await Promise.all([
        query(
          `SELECT b.id, e.name AS exporter_name, b.destination, b.skids, b.tonnage_kg, b.status, b.flight_date
           FROM bookings b
           JOIN exporters e ON b.exporter_id = e.id
           ORDER BY b.created_at DESC
           LIMIT 8`
        ),
        query(
          `SELECT a.name AS airline, c.flight_date, c.destination, c.total_skids, c.total_kg, c.booked_skids, c.booked_kg, c.status
           FROM capacities c
           JOIN airlines a ON c.airline_id = a.id
           ORDER BY c.updated_at DESC
           LIMIT 8`
        ),
        query(`SELECT role, COUNT(*) count FROM users GROUP BY role`)
      ]);

      return res.json({
        role: "airline",
        summary: {
          requestsWaiting: requests.filter((request) => request.status === "pending").length,
          confirmedSkids: requests.filter((request) => request.status === "approved").reduce((sum, request) => sum + Number(request.skids), 0),
          loadFactor: capacities.length ? Math.round((capacities.reduce((sum, item) => sum + Number(item.booked_kg || 0), 0) / Math.max(1, capacities.reduce((sum, item) => sum + Number(item.total_kg || 0), 0))) * 100) : 0,
          userRoles: users
        },
        requests,
        capacities,
        users
      });
    }

    if (role === "agent") {
      const [docs, bookings, exporters] = await Promise.all([
        query(
          `SELECT d.id, d.doc_type, d.file_name, d.created_at, e.name AS exporter_name
           FROM documents d
           JOIN exporters e ON d.exporter_id = e.id
           ORDER BY d.created_at DESC
           LIMIT 10`
        ),
        query(
          `SELECT id, exporter_id, destination, tonnage_kg, status, flight_date
           FROM bookings
           ORDER BY created_at DESC
           LIMIT 8`
        ),
        query(`SELECT id, name FROM exporters ORDER BY id ASC LIMIT 8`)
      ]);

      return res.json({
        role: "agent",
        summary: {
          docsPending: docs.filter((doc) => doc.doc_type).length,
          shipments: bookings.length,
          exportersLinked: exporters.length
        },
        documents: docs,
        bookings,
        exporters
      });
    }

    if (role === "admin") {
      const [users, bookings, invoices, capacities] = await Promise.all([
        query(`SELECT role, COUNT(*) count FROM users GROUP BY role`),
        query(`SELECT status, COUNT(*) count FROM bookings GROUP BY status`),
        query(`SELECT status, COUNT(*) count, COALESCE(SUM(total_amount), 0) total FROM invoices GROUP BY status`),
        query(
          `SELECT a.name AS airline, c.flight_date, c.destination, c.booked_kg, c.total_kg
           FROM capacities c
           JOIN airlines a ON c.airline_id = a.id
           ORDER BY c.flight_date DESC, a.name ASC
           LIMIT 50`
        )
      ]);

      await ensureHeroMediaTable();
      const media = await query(`SELECT id, media_type, file_name, updated_at FROM hero_media ORDER BY updated_at DESC, id DESC LIMIT 1`);

      return res.json({
        role: "admin",
        summary: {
          userCount: users.reduce((sum, item) => sum + Number(item.count), 0),
          bookingCount: bookings.reduce((sum, item) => sum + Number(item.count), 0),
          invoiceTotal: invoices.reduce((sum, item) => sum + Number(item.total || 0), 0),
          media: media[0] || null
        },
        users,
        bookings,
        invoices,
        capacities,
        media
      });
    }

    return res.status(400).json({ message: "Unsupported role" });
  } catch (error) {
    return next(error);
  }
}

async function getHomepageCustomers(req, res, next) {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS homepage_customers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        description VARCHAR(500) NULL,
        website VARCHAR(400) NULL,
        logo_path VARCHAR(400) NULL,
        sort_order INT NOT NULL DEFAULT 0,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    const rows = await query(
      `SELECT id, name, description, website, logo_path, sort_order
       FROM homepage_customers
       WHERE is_active = 1
       ORDER BY sort_order ASC, name ASC`
    );

    const base = process.env.APP_URL || `http://localhost:${process.env.PORT || 4000}`;
    const customers = rows.map((row) => {
      let logo = null;
      if (row.logo_path) {
        const normalized = String(row.logo_path).replace(/\\/g, "/");
        const idx = normalized.lastIndexOf("/uploads/");
        logo = idx !== -1
          ? `${base}${normalized.slice(idx)}`
          : `${base}/uploads/customers/${path.basename(normalized)}`;
      }
      return {
        id: row.id,
        name: row.name,
        description: row.description || "",
        website: row.website || "",
        logo
      };
    });

    return res.json(customers);
  } catch (error) {
    return next(error);
  }
}

async function getExporters(req, res, next) {
  try {
    const exporters = await query(`SELECT id, name, contact_email, whatsapp_contact, logo_url, website FROM exporters WHERE is_locked = 0 ORDER BY name ASC`);
    return res.json(exporters);
  } catch (error) {
    return next(error);
  }
}

module.exports = { getAvailability, getAirlines, getCommodities, getSharedDocument, getHeroMedia, getDashboardSummary, getExporters, getHomepageCustomers };
