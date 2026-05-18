const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { query } = require("../config/db");
const { getMaintenanceSettings, DEFAULT_MAINTENANCE_MESSAGE } = require("../services/systemSettings");

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

async function registerExporter(req, res, next) {
  try {
    const settings = await getMaintenanceSettings();
    if (settings.maintenance_mode) {
      return res.status(503).json({
        message: settings.maintenance_message?.trim() || DEFAULT_MAINTENANCE_MESSAGE,
        code: "MAINTENANCE"
      });
    }

    const { full_name, email, password, exporter_name } = req.body;
    const normalizedEmail = normalizeEmail(email);

    const existing = await query(`SELECT id FROM users WHERE email = ? LIMIT 1`, [normalizedEmail]);
    if (existing.length) {
      return res.status(409).json({ message: "Email already exists" });
    }

    const exporterResult = await query(
      `INSERT INTO exporters (name, contact_email) VALUES (?, ?)`,
      [exporter_name || full_name, normalizedEmail]
    );

    const passwordHash = await bcrypt.hash(password, 10);
    const userResult = await query(
      `INSERT INTO users (full_name, email, password_hash, role, linked_exporter_id, linked_airline, is_active)
       VALUES (?, ?, ?, 'exporter', ?, NULL, 0)` ,
      [full_name, normalizedEmail, passwordHash, exporterResult.insertId]
    );

    return res.status(201).json({
      pending_approval: true,
      message:
        "Registration received. Your exporter account will be inactive until an administrator approves it. You will be able to sign in after approval."
    });
  } catch (error) {
    return next(error);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !String(password || "").length) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const users = await query(
      `SELECT id, full_name, email, password_hash, role, linked_exporter_id, linked_airline, is_locked, is_active
       FROM users WHERE email = ? LIMIT 1`,
      [normalizedEmail]
    );

    if (!users.length) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = users[0];
    if (!user.is_active) {
      return res.status(403).json({
        message:
          user.role === "exporter"
            ? "Your exporter account is pending administrator approval. You cannot sign in until an admin activates it."
            : "Account inactive"
      });
    }
    if (user.is_locked) return res.status(423).json({ message: "Account locked" });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ message: "Invalid credentials" });

    const settings = await getMaintenanceSettings();
    if (settings.maintenance_mode && user.role !== "admin") {
      return res.status(503).json({
        message: settings.maintenance_message?.trim() || DEFAULT_MAINTENANCE_MESSAGE,
        code: "MAINTENANCE"
      });
    }

    const token = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET || "dev-secret", {
      expiresIn: "12h"
    });

    const mainAdminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const isMainAdmin = !!mainAdminEmail && String(user.email || "").trim().toLowerCase() === mainAdminEmail;

    return res.json({
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        linked_exporter_id: user.linked_exporter_id,
        linked_airline: user.linked_airline,
        is_main_admin: isMainAdmin
      }
    });
  } catch (error) {
    return next(error);
  }
}

function me(req, res) {
  const mainAdminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const isMainAdmin = !!mainAdminEmail && String(req.user?.email || "").trim().toLowerCase() === mainAdminEmail;
  return res.json({ user: { ...req.user, is_main_admin: isMainAdmin } });
}

module.exports = { login, me, registerExporter };
