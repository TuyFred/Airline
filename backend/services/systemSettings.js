const jwt = require("jsonwebtoken");
const { query } = require("../config/db");

let cache = null;
let cacheAt = 0;
const TTL_MS = 2500;

const DEFAULT_MAINTENANCE_MESSAGE =
  "The SBU Export Hub is temporarily unavailable while we perform scheduled maintenance. Please try again later.";

function invalidateCache() {
  cache = null;
  cacheAt = 0;
}

function isBearerAdmin(req) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return false;
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "dev-secret");
    return decoded && decoded.role === "admin";
  } catch {
    return false;
  }
}

async function getMaintenanceSettings() {
  const now = Date.now();
  if (cache && now - cacheAt < TTL_MS) {
    return cache;
  }
  const rows = await query(
    `SELECT maintenance_mode, maintenance_message FROM system_settings WHERE id = 1 LIMIT 1`
  );
  const row = rows[0] || { maintenance_mode: 0, maintenance_message: null };
  cache = {
    maintenance_mode: Boolean(Number(row.maintenance_mode)),
    maintenance_message: row.maintenance_message != null ? String(row.maintenance_message) : ""
  };
  cacheAt = now;
  return cache;
}

async function setMaintenanceSettings({ maintenance_mode, maintenance_message }) {
  const mode = maintenance_mode ? 1 : 0;
  const msg =
    maintenance_message !== undefined && maintenance_message !== null
      ? String(maintenance_message).slice(0, 500)
      : null;

  await query(
    `UPDATE system_settings SET maintenance_mode = ?, maintenance_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
    [mode, msg]
  );
  invalidateCache();
  return getMaintenanceSettings();
}

async function maintenanceBlockResponse(req, res) {
  const s = await getMaintenanceSettings();
  return res.status(503).json({
    message: s.maintenance_message?.trim() || DEFAULT_MAINTENANCE_MESSAGE,
    code: "MAINTENANCE"
  });
}

async function enforcePublicMaintenance(req, res, next) {
  if (req.method === "OPTIONS") {
    return next();
  }
  try {
    const s = await getMaintenanceSettings();
    if (!s.maintenance_mode) return next();
    if (isBearerAdmin(req)) return next();
    return maintenanceBlockResponse(req, res);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getMaintenanceSettings,
  setMaintenanceSettings,
  invalidateCache,
  enforcePublicMaintenance,
  maintenanceBlockResponse,
  isBearerAdmin,
  DEFAULT_MAINTENANCE_MESSAGE
};
