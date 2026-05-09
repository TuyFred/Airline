const fs = require("fs");
const path = require("path");
const { query } = require("../config/db");

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

  // Ensure older installations that had video-only enum can also store images.
  await query(`ALTER TABLE hero_media MODIFY COLUMN media_type ENUM('video', 'image') NOT NULL DEFAULT 'video'`);

  // Ensure the is_muted column exists on legacy installations.
  try {
    await query(`ALTER TABLE hero_media ADD COLUMN is_muted TINYINT(1) NOT NULL DEFAULT 0`);
  } catch (error) {
    // Column already exists on newer installations; ignore.
    if (!/duplicate column|already exists/i.test(error?.message || '')) {
      // Re-throw unexpected errors so admins notice them.
      // eslint-disable-next-line no-console
      console.warn('[hero_media] ensure is_muted column:', error.message);
    }
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

async function uploadHeroMedia(req, res, next) {
  try {
    await ensureHeroMediaTable();
    const uploadedFile = req.file || (Array.isArray(req.files) ? req.files[0] : null);

    if (!uploadedFile) {
      return res.status(400).json({ message: "Media file is required" });
    }

    const mediaType = String(uploadedFile.mimetype || "").startsWith("image/") ? "image" : "video";

    await query(`UPDATE hero_media SET is_active = 0`);

    const result = await query(
      `INSERT INTO hero_media (media_type, file_name, file_path, mime_type, uploaded_by, is_active, is_muted)
       VALUES (?, ?, ?, ?, ?, 1, 0)`,
      [mediaType, uploadedFile.originalname, uploadedFile.path, uploadedFile.mimetype, req.user.id]
    );

    return res.status(201).json({
      message: `Hero ${mediaType} updated`,
      id: result.insertId,
      mediaType,
      url: buildMediaUrl(uploadedFile.path),
      isMuted: false
    });
  } catch (error) {
    return next(error);
  }
}

async function setHeroMediaMute(req, res, next) {
  try {
    await ensureHeroMediaTable();
    const isMuted = req.body?.isMuted === true || req.body?.isMuted === 'true' || req.body?.isMuted === 1 || req.body?.isMuted === '1';

    const rows = await query(
      `SELECT id FROM hero_media WHERE is_active = 1 ORDER BY updated_at DESC, id DESC LIMIT 1`
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'No active hero media found' });
    }

    await query(`UPDATE hero_media SET is_muted = ? WHERE id = ?`, [isMuted ? 1 : 0, rows[0].id]);

    return res.json({ id: rows[0].id, isMuted });
  } catch (error) {
    return next(error);
  }
}

module.exports = { getHeroMedia, uploadHeroMedia, setHeroMediaMute };
