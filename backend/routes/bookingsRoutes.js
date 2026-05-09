const express = require("express");
const { body } = require("express-validator");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const {
  createBooking,
  getMyBookings,
  getBookingsForAirline,
  getBookingsGroupedByExporter,
  reviewBooking,
  cancelBookingByExporter,
  confirmUpliftByExporter,
  addUpliftNotification,
  addUpliftConfirmation,
  confirmBookingByAnalyst,
  addAdditionalRequest,
  rescheduleRequest,
  editBookingCapacity,
  editPendingBooking,
  getUpliftNotifications,
  markUpliftNotificationRead,
  deleteUpliftNotification,
  adjustExporterApprovedAllocation,
  approvePendingAllocationIncrease,
  exportBookingsToExcel,
  exportGroupedBookingsToExcel,
  exportCapacityToExcel,
  getBookingsForExporterClearing
} = require("../controllers/bookingsController");
const { authRequired, requireRoles } = require("../Midleware/auth");
const { handleValidation } = require("../Midleware/validate");
const uploadsDir = path.join(process.cwd(), "uploads", "uplift-docs");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`)
});

const upload = multer({ storage });


const router = express.Router();

router.use(authRequired);

router.get("/exporter/:exporterId", requireRoles("clearing_agent", "admin"), getBookingsForExporterClearing);

router.post(
  "/",
  requireRoles("exporter"),
  body("capacity_id").optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }),
  body("airline_id").isInt({ min: 1 }),
  body("flight_date").isISO8601(),
  body("destination").notEmpty(),
  body("skids").isInt({ min: 1 }),
  body("tonnage_kg").isFloat({ gt: 0 }),
  body("commodity").notEmpty(),
  body("booking_mode").optional({ nullable: true, checkFalsy: true }).isString(),
  body("transit_airport").optional({ nullable: true, checkFalsy: true }).isString(),
  handleValidation,
  createBooking
);

router.get("/my", requireRoles("exporter"), getMyBookings);
router.get("/uplift-notifications", requireRoles("exporter"), getUpliftNotifications);
router.patch("/uplift-notifications/:id/read", requireRoles("exporter"), markUpliftNotificationRead);
router.delete("/uplift-notifications/:id", requireRoles("exporter"), deleteUpliftNotification);
router.get("/my/export", requireRoles("exporter"), exportBookingsToExcel);
router.get("/my/capacity/export", requireRoles("exporter", "airline_analyst", "airline_supervisor", "admin"), exportCapacityToExcel);
router.get("/airline", requireRoles("airline_analyst", "airline_supervisor", "admin"), getBookingsForAirline);
router.get("/grouped/:airline", requireRoles("airline_analyst", "airline_supervisor", "admin"), getBookingsGroupedByExporter);
router.get("/grouped/:airline/export", requireRoles("airline_analyst", "airline_supervisor", "admin"), exportGroupedBookingsToExcel);
router.patch("/:id/review", requireRoles("airline_analyst", "airline_supervisor", "admin"), reviewBooking);
router.patch("/:id/edit-capacity", requireRoles("airline_analyst", "airline_supervisor", "admin"), editBookingCapacity);
router.patch(
  "/:id/allocation-exporter",
  requireRoles("exporter"),
  body("skids").isInt({ min: 1 }),
  body("tonnage_kg").isFloat({ gt: 0 }),
  handleValidation,
  adjustExporterApprovedAllocation
);
router.patch("/:id/approve-pending-allocation", requireRoles("airline_analyst", "airline_supervisor", "admin"), approvePendingAllocationIncrease);
router.patch(
  "/:id/edit-pending",
  requireRoles("exporter"),
  body("flight_date").isISO8601(),
  body("skids").isInt({ min: 1 }),
  body("tonnage_kg").isFloat({ gt: 0 }),
  handleValidation,
  editPendingBooking
);
router.patch("/:id/cancel", requireRoles("exporter"), cancelBookingByExporter);
router.patch("/:id/confirm-uplift", requireRoles("exporter"), confirmUpliftByExporter);
router.post("/:id/uplift-notification", requireRoles("airline_analyst", "airline_supervisor", "admin"), upload.single("document"), addUpliftNotification);
router.post("/:id/uplift-confirm", requireRoles("airline_analyst", "airline_supervisor", "clearing_agent"), addUpliftConfirmation);
router.patch("/:id/confirm", requireRoles("airline_analyst", "airline_supervisor", "admin"), confirmBookingByAnalyst);
router.patch("/:id/additional-request", requireRoles("airline_analyst", "airline_supervisor", "admin"), addAdditionalRequest);
router.patch("/:id/reschedule", requireRoles("airline_analyst", "airline_supervisor", "admin"), rescheduleRequest);

module.exports = router;
