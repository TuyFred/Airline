const { getMaintenanceSettings, setMaintenanceSettings, DEFAULT_MAINTENANCE_MESSAGE } = require("../services/systemSettings");

async function getPublicSystemStatus(req, res, next) {
  try {
    const s = await getMaintenanceSettings();
    const custom = s.maintenance_message?.trim();
    return res.json({
      maintenance: s.maintenance_mode,
      message:
        custom || (s.maintenance_mode ? DEFAULT_MAINTENANCE_MESSAGE : "")
    });
  } catch (error) {
    return next(error);
  }
}

async function getAdminMaintenanceSettings(req, res, next) {
  try {
    const s = await getMaintenanceSettings();
    return res.json({
      maintenance: s.maintenance_mode,
      maintenance_message: s.maintenance_message || ""
    });
  } catch (error) {
    return next(error);
  }
}

async function patchMaintenanceSettings(req, res, next) {
  try {
    const { maintenance_mode, maintenance_message } = req.body;
    if (maintenance_mode === undefined || maintenance_mode === null) {
      return res.status(400).json({ message: "maintenance_mode is required" });
    }
    await setMaintenanceSettings({
      maintenance_mode: Boolean(maintenance_mode),
      maintenance_message: maintenance_message != null ? String(maintenance_message) : ""
    });
    const s = await getMaintenanceSettings();
    return res.json({
      ok: true,
      maintenance: s.maintenance_mode,
      message: s.maintenance_message?.trim() || DEFAULT_MAINTENANCE_MESSAGE
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { getPublicSystemStatus, getAdminMaintenanceSettings, patchMaintenanceSettings };
