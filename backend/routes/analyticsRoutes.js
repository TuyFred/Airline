const express = require("express");
const {
  exporterPerformance,
  airlineUtilization,
  adminOverview,
  exporterPerformanceAnalytics,
  capacityCrunch
} = require("../controllers/analyticsController");
const { authRequired, requireRoles } = require("../Midleware/auth");

const router = express.Router();

router.use(authRequired);
router.get("/exporter", requireRoles("exporter"), exporterPerformance);
router.get(
  "/exporter-performance",
  requireRoles("admin", "airline_analyst", "airline_supervisor", "exporter"),
  exporterPerformanceAnalytics
);
router.get("/capacity-crunch", requireRoles("admin", "airline_analyst", "airline_supervisor"), capacityCrunch);
router.get("/airline", requireRoles("airline_analyst", "airline_supervisor", "admin"), airlineUtilization);
router.get("/admin", requireRoles("admin"), adminOverview);

module.exports = router;
