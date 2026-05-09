const express = require("express");
const {
  listInvoices,
  getFinanceDashboard,
  markInvoicePaid,
  runWeeklyInvoiceNow,
  downloadInvoicePdf,
  downloadInvoiceExcel,
  listExporterPricing,
  upsertExporterPricing,
  downloadWeeklyInvoiceReport
} = require("../controllers/financeController");
const { authRequired, requireRoles } = require("../Midleware/auth");

const router = express.Router();

router.use(authRequired);
router.get("/invoices", requireRoles("admin", "exporter"), listInvoices);
router.get("/invoices/:id/pdf", requireRoles("admin", "exporter"), downloadInvoicePdf);
router.get("/invoices/:id/excel", requireRoles("admin", "exporter"), downloadInvoiceExcel);
router.get("/dashboard", requireRoles("admin", "exporter"), getFinanceDashboard);
router.patch("/invoices/:id/pay", requireRoles("admin"), markInvoicePaid);
router.post("/invoices/run-weekly", requireRoles("admin"), runWeeklyInvoiceNow);
router.get("/exporter-pricing", requireRoles("admin"), listExporterPricing);
router.post("/exporter-pricing", requireRoles("admin"), upsertExporterPricing);
router.get("/weekly-invoice-report.xlsx", requireRoles("admin"), downloadWeeklyInvoiceReport);

module.exports = router;
