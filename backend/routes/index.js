const express = require("express");
const authRoutes = require("./authRoutes");
const publicRoutes = require("./publicRoutes");
const bookingsRoutes = require("./bookingsRoutes");
const capacityRoutes = require("./capacityRoutes");
const airlinesRoutes = require("./airlinesRoutes");
const documentsRoutes = require("./documentsRoutes");
const mediaRoutes = require("./mediaRoutes");
const financeRoutes = require("./financeRoutes");
const analyticsRoutes = require("./analyticsRoutes");
const usersRoutes = require("./usersRoutes");
const notificationsRoutes = require("./notificationsRoutes");
const supportRoutes = require("./supportRoutes");
const adminRoutes = require("./adminRoutes");
const customersRoutes = require("./customersRoutes");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/public", publicRoutes);
router.use("/bookings", bookingsRoutes);
router.use("/capacity", capacityRoutes);
router.use("/airlines", airlinesRoutes);
router.use("/documents", documentsRoutes);
router.use("/media", mediaRoutes);
router.use("/finance", financeRoutes);
router.use("/analytics", analyticsRoutes);
router.use("/users", usersRoutes);
router.use("/notifications", notificationsRoutes);
router.use("/support", supportRoutes);
router.use("/admin", adminRoutes);
router.use("/customers", customersRoutes);

module.exports = router;
