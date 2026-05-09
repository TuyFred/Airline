const { query } = require("../config/db");
const { pushNotification } = require("../utils/notifications");
const { sendBrevoEmail, getBrevoSender } = require("../utils/email");

async function sendWhatsAppNotice(phone, text) {
  const webhook = String(process.env.WHATSAPP_WEBHOOK_URL || "").trim();
  if (!webhook || !phone) return { sent: false, reason: "whatsapp-not-configured" };

  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: phone, message: text, type: "general_notification" })
    });
    if (!response.ok) return { sent: false, reason: `webhook-${response.status}` };
    return { sent: true };
  } catch (error) {
    return { sent: false, reason: error.message };
  }
}

async function listMyNotifications(req, res, next) {
  try {
    const rows = await query(
      `SELECT id, title, message, type, is_read, created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
}

async function markRead(req, res, next) {
  try {
    const { id } = req.params;
    await query(`UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`, [id, req.user.id]);
    return res.json({ message: "Marked as read" });
  } catch (error) {
    return next(error);
  }
}

async function deleteNotification(req, res, next) {
  try {
    const { id } = req.params;
    await query(`DELETE FROM notifications WHERE id = ? AND user_id = ?`, [id, req.user.id]);
    return res.json({ message: "Notification deleted" });
  } catch (error) {
    return next(error);
  }
}

// Send broadcast notification to all exporters (airline_analyst or airline_supervisor)
async function sendBroadcast(req, res, next) {
  try {
    const allowedRoles = ['airline_analyst', 'airline_supervisor', 'admin'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "Not authorized to send broadcast notifications" });
    }

    const { title, message, type } = req.body;
    if (!title || !message) {
      return res.status(400).json({ message: "Title and message are required" });
    }

    // Record broadcast
    await query(
      `INSERT INTO broadcast_notifications (sender_id, title, message, type) VALUES (?, ?, ?, ?)`,
      [req.user.id, title, message, type || 'info']
    );

    // Push notification to all active exporters
    const exporterUsers = await query(
      `SELECT id FROM users WHERE role = 'exporter' AND is_active = 1 AND is_locked = 0`
    );

    for (const user of exporterUsers) {
      await pushNotification(user.id, title, message, type || 'info');
    }

    return res.json({ message: "Broadcast sent", recipients: exporterUsers.length });
  } catch (error) {
    return next(error);
  }
}

async function sendDirectNotification(req, res, next) {
  try {
    const allowedRoles = ['airline_analyst', 'airline_supervisor', 'admin'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "Not authorized to send notifications" });
    }

    const { exporter_id, title, message, type = 'info', send_email = true, send_whatsapp = true } = req.body;
    if (!exporter_id || !title || !message) {
      return res.status(400).json({ message: "Exporter, title, and message are required" });
    }

    const exporterRows = await query(
      `SELECT id, name, contact_email, whatsapp_contact FROM exporters WHERE id = ? LIMIT 1`,
      [exporter_id]
    );
    if (!exporterRows.length) return res.status(404).json({ message: "Exporter not found" });
    const exporter = exporterRows[0];

    const users = await query(
      `SELECT id, full_name, email FROM users WHERE linked_exporter_id = ? AND role = 'exporter' AND is_active = 1`,
      [exporter_id]
    );

    for (const user of users) {
      await pushNotification(user.id, title, message, type);
    }

    let emailCount = 0;
    if (send_email && process.env.BREVO_API_KEY) {
      const recipients = users
        .filter((user) => user.email)
        .map((user) => ({ email: user.email, name: user.full_name || exporter.name }));
      if (!recipients.length && exporter.contact_email) {
        recipients.push({ email: exporter.contact_email, name: exporter.name });
      }
      if (recipients.length) {
        await sendBrevoEmail({
          sender: getBrevoSender(),
          to: recipients,
          subject: title,
          textContent: `${message}\n\nSent by ${req.user.full_name || 'SBU Airline Analyst'}`
        });
        emailCount = recipients.length;
      }
    }

    const whatsapp = send_whatsapp
      ? await sendWhatsAppNotice(exporter.whatsapp_contact, `${title}\n\n${message}`)
      : { sent: false, reason: "disabled" };

    return res.json({
      message: "Notification sent",
      dashboard_recipients: users.length,
      email_recipients: emailCount,
      whatsapp_sent: Boolean(whatsapp.sent),
      whatsapp_status: whatsapp.reason || "sent"
    });
  } catch (error) {
    return next(error);
  }
}

// List all broadcast notifications
async function listBroadcasts(req, res, next) {
  try {
    const rows = await query(
      `SELECT bn.id, bn.title, bn.message, bn.type, bn.created_at, u.full_name AS sender
       FROM broadcast_notifications bn
       JOIN users u ON bn.sender_id = u.id
       ORDER BY bn.created_at DESC
       LIMIT 50`
    );
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
}

// Send uplift SMS notification (airline_analyst or airline_supervisor)
async function sendUpliftSms(req, res, next) {
  try {
    const allowedRoles = ['airline_analyst', 'airline_supervisor', 'admin'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "Not authorized to send uplift notifications" });
    }

    const { booking_id, sms_type, destination, reason, custom_message, exporter_name } = req.body;
    if (!booking_id || !sms_type) {
      return res.status(400).json({ message: "booking_id and sms_type are required" });
    }

    const bookingRows = await query(
      `SELECT b.id, b.exporter_id, b.destination, b.tonnage_kg, b.skids, a.name AS airline
       FROM bookings b JOIN airlines a ON b.airline_id = a.id WHERE b.id = ? LIMIT 1`,
      [booking_id]
    );
    if (!bookingRows.length) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const booking = bookingRows[0];

    // Build notification message based on SMS type
    const exporterLabel = exporter_name || 'Exporter';
    const dest = destination || booking.destination;
    let notifTitle = '';
    let notifMessage = '';

    if (sms_type === 'loaded') {
      notifTitle = 'Shipment Loaded Successfully';
      notifMessage = `Dear ${exporterLabel}, please be informed that your shipment to ${dest} has been loaded successfully. Kindly notify the client to prepare for collection upon arrival. Thanks & Best regards, Airline Analyst`;
    } else if (sms_type === 'offloaded') {
      notifTitle = 'Shipment Offloaded';
      const offloadReason = reason || 'operational reasons';
      notifMessage = `Dear ${exporterLabel} Team, unfortunately your shipment to ${dest} has been offloaded due to ${offloadReason}. Kindly be informed that your shipment will be uplifted on the next available flight. We sincerely apologize for any inconvenience. Kind regards`;
    } else if (sms_type === 'partial') {
      notifTitle = 'Partial Shipment Offload';
      notifMessage = custom_message || `Dear ${exporterLabel}, please be informed that part of your shipment to ${dest} has been offloaded due to operational reasons. The remaining shipment has been scheduled for the next available flight. Thank you for your understanding. Kind regards`;
    } else if (sms_type === 'custom') {
      notifTitle = 'Shipment Update';
      notifMessage = custom_message || `Dear ${exporterLabel}, please find an update regarding your shipment to ${dest}.`;
    } else {
      return res.status(400).json({ message: "Invalid sms_type. Use: loaded, offloaded, partial, custom" });
    }

    // Record SMS log
    await query(
      `INSERT INTO uplift_sms_logs (booking_id, sender_id, exporter_id, sms_type, destination, reason, custom_message)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [booking_id, req.user.id, booking.exporter_id, sms_type, dest, reason || null, custom_message || null]
    );

    // Push notification to all exporter users linked to this booking
    const exporterUsers = await query(
      `SELECT id FROM users WHERE linked_exporter_id = ? AND role = 'exporter' AND is_active = 1`,
      [booking.exporter_id]
    );

    for (const user of exporterUsers) {
      await pushNotification(user.id, notifTitle, notifMessage, sms_type === 'loaded' ? 'success' : 'warning');
    }

    return res.json({ message: "Uplift notification sent", recipients: exporterUsers.length, title: notifTitle });
  } catch (error) {
    return next(error);
  }
}

// Get uplift SMS logs
async function listUpliftSmsLogs(req, res, next) {
  try {
    const rows = await query(
      `SELECT sl.id, sl.booking_id, sl.sms_type, sl.destination, sl.reason, sl.custom_message, sl.sent_at,
              u.full_name AS sender, e.name AS exporter
       FROM uplift_sms_logs sl
       JOIN users u ON sl.sender_id = u.id
       JOIN exporters e ON sl.exporter_id = e.id
       ORDER BY sl.sent_at DESC
       LIMIT 100`
    );
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
}

module.exports = { listMyNotifications, markRead, deleteNotification, sendBroadcast, sendDirectNotification, listBroadcasts, sendUpliftSms, listUpliftSmsLogs };
