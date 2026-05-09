const fs = require("fs");
const path = require("path");
const { query } = require("../config/db");

function buildLogoUrl(filePath) {
  if (!filePath) return null;
  const normalized = String(filePath).replace(/\\/g, "/");
  const uploadsIndex = normalized.lastIndexOf("/uploads/");
  const base = process.env.APP_URL || `http://localhost:${process.env.PORT || 4000}`;
  if (uploadsIndex !== -1) return `${base}${normalized.slice(uploadsIndex)}`;
  const fileName = path.basename(normalized);
  return `${base}/uploads/customers/${fileName}`;
}

function shapeRow(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    website: row.website || "",
    logo: buildLogoUrl(row.logo_path),
    logo_path: row.logo_path || null,
    sort_order: Number(row.sort_order || 0),
    is_active: !!row.is_active,
    updated_at: row.updated_at
  };
}

async function listCustomers(req, res, next) {
  try {
    const onlyActive = String(req.query.active || "").toLowerCase() === "true";
    const where = onlyActive ? "WHERE is_active = 1" : "";
    const rows = await query(
      `SELECT id, name, description, website, logo_path, sort_order, is_active, updated_at
       FROM homepage_customers
       ${where}
       ORDER BY sort_order ASC, name ASC`
    );
    return res.json(rows.map(shapeRow));
  } catch (error) {
    return next(error);
  }
}

async function createCustomer(req, res, next) {
  try {
    const file = req.file || (Array.isArray(req.files) ? req.files[0] : null);
    const { name, description, website, sort_order, is_active } = req.body;

    if (!String(name || "").trim()) {
      return res.status(400).json({ message: "Customer name is required" });
    }

    const exists = await query(
      `SELECT id FROM homepage_customers WHERE LOWER(name) = LOWER(?) LIMIT 1`,
      [name.trim()]
    );
    if (exists.length) {
      return res.status(409).json({ message: "A customer with this name already exists" });
    }

    const result = await query(
      `INSERT INTO homepage_customers
        (name, description, website, logo_path, sort_order, is_active, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        String(description || "").trim() || null,
        String(website || "").trim() || null,
        file ? file.path : null,
        Number(sort_order || 0),
        is_active === "false" || is_active === false || is_active === 0 || is_active === "0" ? 0 : 1,
        req.user?.id || null
      ]
    );

    const rows = await query(
      `SELECT id, name, description, website, logo_path, sort_order, is_active, updated_at
       FROM homepage_customers WHERE id = ? LIMIT 1`,
      [result.insertId]
    );
    return res.status(201).json({ message: "Customer added", customer: rows.length ? shapeRow(rows[0]) : null });
  } catch (error) {
    return next(error);
  }
}

async function updateCustomer(req, res, next) {
  try {
    const { id } = req.params;
    const file = req.file || (Array.isArray(req.files) ? req.files[0] : null);
    const { name, description, website, sort_order, is_active, remove_logo } = req.body;

    const existing = await query(
      `SELECT id, logo_path FROM homepage_customers WHERE id = ? LIMIT 1`,
      [id]
    );
    if (!existing.length) {
      return res.status(404).json({ message: "Customer not found" });
    }

    if (!String(name || "").trim()) {
      return res.status(400).json({ message: "Customer name is required" });
    }

    const conflict = await query(
      `SELECT id FROM homepage_customers WHERE LOWER(name) = LOWER(?) AND id <> ? LIMIT 1`,
      [name.trim(), id]
    );
    if (conflict.length) {
      return res.status(409).json({ message: "Another customer already uses this name" });
    }

    let nextLogoPath = existing[0].logo_path || null;
    if (file) {
      nextLogoPath = file.path;
    }
    if (remove_logo === "true" || remove_logo === true) {
      nextLogoPath = null;
    }

    await query(
      `UPDATE homepage_customers
         SET name = ?, description = ?, website = ?, logo_path = ?, sort_order = ?, is_active = ?
       WHERE id = ?`,
      [
        name.trim(),
        String(description || "").trim() || null,
        String(website || "").trim() || null,
        nextLogoPath,
        Number(sort_order || 0),
        is_active === "false" || is_active === false || is_active === 0 || is_active === "0" ? 0 : 1,
        id
      ]
    );

    // Best-effort cleanup of replaced/removed file
    if (existing[0].logo_path && nextLogoPath !== existing[0].logo_path) {
      const oldPath = path.isAbsolute(existing[0].logo_path)
        ? existing[0].logo_path
        : path.join(process.cwd(), existing[0].logo_path);
      fs.unlink(oldPath, () => {});
    }

    const rows = await query(
      `SELECT id, name, description, website, logo_path, sort_order, is_active, updated_at
       FROM homepage_customers WHERE id = ? LIMIT 1`,
      [id]
    );
    return res.json({ message: "Customer updated", customer: rows.length ? shapeRow(rows[0]) : null });
  } catch (error) {
    return next(error);
  }
}

async function deleteCustomer(req, res, next) {
  try {
    const { id } = req.params;
    const rows = await query(
      `SELECT id, logo_path FROM homepage_customers WHERE id = ? LIMIT 1`,
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ message: "Customer not found" });
    }

    await query(`DELETE FROM homepage_customers WHERE id = ?`, [id]);

    if (rows[0].logo_path) {
      const oldPath = path.isAbsolute(rows[0].logo_path)
        ? rows[0].logo_path
        : path.join(process.cwd(), rows[0].logo_path);
      fs.unlink(oldPath, () => {});
    }

    return res.json({ message: "Customer deleted" });
  } catch (error) {
    return next(error);
  }
}

module.exports = { listCustomers, createCustomer, updateCustomer, deleteCustomer };
