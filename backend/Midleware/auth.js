const jwt = require("jsonwebtoken");
const { query } = require("../config/db");
const { getMaintenanceSettings, DEFAULT_MAINTENANCE_MESSAGE } = require("../services/systemSettings");

async function authRequired(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: "Missing token" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "dev-secret");
    const users = await query(
      `SELECT id, full_name, email, role, linked_exporter_id, linked_airline, is_locked, is_active, password_changed_at
       FROM users WHERE id = ? LIMIT 1`,
      [decoded.sub]
    );

    if (!users.length || !users[0].is_active) {
      return res.status(401).json({ message: "User not active" });
    }

    if (users[0].is_locked) {
      return res.status(423).json({ message: "Account is locked" });
    }

    /* Invalidate tokens issued before the most recent password change */
    if (users[0].password_changed_at && decoded.iat) {
      const passwordChangedSec = Math.floor(new Date(users[0].password_changed_at).getTime() / 1000);
      if (decoded.iat < passwordChangedSec) {
        return res.status(401).json({ message: "Session expired — please sign in again." });
      }
    }

    req.user = users[0];

    const maintenance = await getMaintenanceSettings();
    if (maintenance.maintenance_mode && req.user.role !== "admin") {
      return res.status(503).json({
        message: maintenance.maintenance_message?.trim() || DEFAULT_MAINTENANCE_MESSAGE,
        code: "MAINTENANCE"
      });
    }

    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

function requireRoles(...allowed) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    return next();
  };
}

module.exports = {
  authRequired,
  requireRoles
};
