const express = require("express");
const { listMyNotifications, markRead, deleteNotification, sendBroadcast, sendDirectNotification, listBroadcasts, sendUpliftSms, listUpliftSmsLogs } = require("../controllers/notificationsController");
const { authRequired } = require("../Midleware/auth");

const router = express.Router();

router.use(authRequired);
router.get("/", listMyNotifications);
router.patch("/:id/read", markRead);
router.delete("/:id", deleteNotification);
router.post("/broadcast", sendBroadcast);
router.post("/direct", sendDirectNotification);
router.get("/broadcasts", listBroadcasts);
router.post("/uplift-sms", sendUpliftSms);
router.get("/uplift-sms-logs", listUpliftSmsLogs);

module.exports = router;
