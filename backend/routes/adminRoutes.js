const express = require("express");
const { authRequired, requireRoles } = require("../Midleware/auth");
const { getAdminMaintenanceSettings, patchMaintenanceSettings } = require("../controllers/systemSettingsController");

const router = express.Router();

router.get("/maintenance", authRequired, requireRoles("admin"), getAdminMaintenanceSettings);
router.patch("/maintenance", authRequired, requireRoles("admin"), patchMaintenanceSettings);

module.exports = router;
