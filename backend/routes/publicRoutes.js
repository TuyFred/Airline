const express = require("express");
const { getAvailability, getAirlines, getCommodities, getSharedDocument, getHeroMedia, getDashboardSummary, getExporters, getHomepageCustomers } = require("../controllers/publicController");
const { getPublicSystemStatus } = require("../controllers/systemSettingsController");
const { enforcePublicMaintenance } = require("../services/systemSettings");

const router = express.Router();

router.get("/system-status", getPublicSystemStatus);
router.use(enforcePublicMaintenance);

router.get("/availability", getAvailability);
router.get("/airlines", getAirlines);
router.get("/commodities", getCommodities);
router.get("/exporters", getExporters);
router.get("/customers", getHomepageCustomers);
router.get("/hero-media", getHeroMedia);
router.get("/dashboards/:role", getDashboardSummary);
router.get("/documents/:token", getSharedDocument);

module.exports = router;
