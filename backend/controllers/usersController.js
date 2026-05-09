const { query } = require("../config/db");
const bcrypt = require("bcryptjs");
const { sendBrevoEmail, getBrevoSender } = require("../utils/email");
const { accountLockedEmail } = require("../utils/emailTemplates");

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

async function sendWhatsAppLockNotice(phone, text) {
  const webhook = String(process.env.WHATSAPP_WEBHOOK_URL || "").trim();
  if (!webhook) return { sent: false, reason: "webhook-not-configured" };

  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: phone, message: text, type: "account_lock" })
    });

    if (!response.ok) {
      const body = await response.text();
      return { sent: false, reason: `webhook-error:${response.status}`, details: body };
    }

    return { sent: true };
  } catch (error) {
    return { sent: false, reason: "webhook-request-failed", details: error.message };
  }
}

async function getActiveAdminCount() {
  const rows = await query(
    `SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_active = 1`
  );
  return Number(rows[0]?.count || 0);
}

async function ensureLockHistoryTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS user_lock_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      target_user_id INT NULL,
      target_name VARCHAR(150) NULL,
      target_email VARCHAR(150) NULL,
      admin_user_id INT NULL,
      admin_name VARCHAR(150) NULL,
      admin_email VARCHAR(150) NULL,
      action ENUM('lock', 'unlock') NOT NULL,
      contact_number VARCHAR(25) NULL,
      lock_reason VARCHAR(255) NULL,
      admin_message TEXT NULL,
      email_notified TINYINT(1) NOT NULL DEFAULT 0,
      whatsapp_notified TINYINT(1) NOT NULL DEFAULT 0,
      whatsapp_status VARCHAR(120) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_lock_history_target (target_user_id),
      INDEX idx_user_lock_history_admin (admin_user_id),
      INDEX idx_user_lock_history_created (created_at),
      CONSTRAINT fk_lock_history_target_user FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT fk_lock_history_admin_user FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);
}

async function recordLockHistory(event) {
  await ensureLockHistoryTable();
  await query(
    `INSERT INTO user_lock_history (
      target_user_id, target_name, target_email,
      admin_user_id, admin_name, admin_email,
      action, contact_number, lock_reason, admin_message,
      email_notified, whatsapp_notified, whatsapp_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
    [
      event.targetUserId || null,
      event.targetName || null,
      event.targetEmail || null,
      event.adminUserId || null,
      event.adminName || null,
      event.adminEmail || null,
      event.action,
      event.contactNumber || null,
      event.lockReason || null,
      event.adminMessage || null,
      event.emailNotified ? 1 : 0,
      event.whatsappNotified ? 1 : 0,
      event.whatsappStatus || null
    ]
  );
}

function isMainAdminEmail(email) {
  const mainAdminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  return Boolean(mainAdminEmail) && String(email || "").trim().toLowerCase() === mainAdminEmail;
}

async function createUser(req, res, next) {
  try {
    const { full_name, email, password, role, linked_exporter_id, linked_airline } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (role === "admin" && !isMainAdminEmail(req.user?.email)) {
      return res.status(403).json({
        message: "Only the main administrator can create new admin accounts."
      });
    }

    const existing = await query(`SELECT id FROM users WHERE email = ? LIMIT 1`, [normalizedEmail]);
    if (existing.length) {
      return res.status(409).json({ message: "Email already exists" });
    }

    if (["airline_analyst", "airline_supervisor"].includes(role) && !String(linked_airline || "").trim()) {
      return res.status(400).json({ message: "Linked airline is required for airline analyst or supervisor users" });
    }

    let exporterId = linked_exporter_id ? Number(linked_exporter_id) : null;
    if (role === 'exporter' && !exporterId) {
      const exporterResult = await query(`INSERT INTO exporters (name, contact_email) VALUES (?, ?)`, [full_name, normalizedEmail]);
      exporterId = exporterResult.insertId;
    }

    // For clearing_agent, allow linking to an existing exporter
    const resolvedExporterId = ["exporter", "clearing_agent"].includes(role) ? exporterId : null;

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO users (full_name, email, password_hash, role, linked_exporter_id, linked_airline)
       VALUES (?, ?, ?, ?, ?, ?)` ,
      [
        full_name,
        normalizedEmail,
        passwordHash,
        role,
        resolvedExporterId,
        ["airline_analyst", "airline_supervisor"].includes(role) ? String(linked_airline || "").trim() : null
      ]
    );

    return res.status(201).json({ id: result.insertId, message: "User created" });
  } catch (error) {
    return next(error);
  }
}

async function listUsers(req, res, next) {
  try {
    const rows = await query(
      `SELECT id, full_name, email, role, linked_exporter_id, linked_airline, is_locked, is_active, created_at
       FROM users ORDER BY created_at DESC`
    );
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
}

async function listLockHistory(req, res, next) {
  try {
    await ensureLockHistoryTable();
    const rows = await query(
      `SELECT id,
              target_user_id,
              target_name,
              target_email,
              admin_user_id,
              admin_name,
              admin_email,
              action,
              contact_number,
              lock_reason,
              admin_message,
              email_notified,
              whatsapp_notified,
              whatsapp_status,
              created_at
       FROM user_lock_history
       ORDER BY created_at DESC
       LIMIT 200`
    );
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
}

async function getUser(req, res, next) {
  try {
    const { id } = req.params;
    const rows = await query(
      `SELECT id, full_name, email, role, linked_exporter_id, linked_airline, is_locked, is_active, created_at
       FROM users WHERE id = ? LIMIT 1`,
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ message: "User not found" });
    }
    return res.json(rows[0]);
  } catch (error) {
    return next(error);
  }
}

async function updateUser(req, res, next) {
  try {
    const { id } = req.params;
    const { full_name, email, password, role, linked_airline, linked_exporter_id } = req.body;
    const normalizedEmail = normalizeEmail(email);

    const targetRows = await query(`SELECT id, role, email FROM users WHERE id = ? LIMIT 1`, [id]);
    if (!targetRows.length) {
      return res.status(404).json({ message: "User not found" });
    }
    const targetUser = targetRows[0];

    if (targetUser.role === "admin" && role !== "admin") {
      const adminCount = await getActiveAdminCount();
      if (adminCount <= 1) {
        return res.status(400).json({ message: "You cannot change the role of the last active admin" });
      }
    }

    // Promotion to admin can only be done by the main admin
    if (role === "admin" && targetUser.role !== "admin" && !isMainAdminEmail(req.user?.email)) {
      return res.status(403).json({
        message: "Only the main administrator can promote a user to admin."
      });
    }
    // Editing an existing admin (other than yourself) is reserved to the main admin
    if (targetUser.role === "admin" && Number(targetUser.id) !== Number(req.user?.id) && !isMainAdminEmail(req.user?.email)) {
      return res.status(403).json({
        message: "Only the main administrator can modify another admin account."
      });
    }

    if (["airline_analyst", "airline_supervisor"].includes(role) && !String(linked_airline || "").trim()) {
      return res.status(400).json({ message: "Linked airline is required for airline analyst or supervisor users" });
    }

    const existing = await query(`SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1`, [normalizedEmail, id]);
    if (existing.length) {
      return res.status(409).json({ message: "Email already exists" });
    }

    let exporterId = null;
    if (role === "exporter") {
      if (linked_exporter_id) {
        exporterId = Number(linked_exporter_id);
      } else if (targetUser.role === "exporter") {
        const current = await query(`SELECT linked_exporter_id FROM users WHERE id = ? LIMIT 1`, [id]);
        exporterId = current[0]?.linked_exporter_id || null;
      }

      if (!exporterId) {
        const exporterResult = await query(
          `INSERT INTO exporters (name, contact_email) VALUES (?, ?)`,
          [full_name, normalizedEmail]
        );
        exporterId = exporterResult.insertId;
      }
    }

    const resolvedExporterId = role === "exporter" ? exporterId : (role === "clearing_agent" && linked_exporter_id ? Number(linked_exporter_id) : null);

    const params = [
      full_name,
      normalizedEmail,
      role,
      resolvedExporterId,
      ["airline_analyst", "airline_supervisor"].includes(role) ? String(linked_airline || "").trim() : null,
      id
    ];
    let sql = `
      UPDATE users
      SET full_name = ?, email = ?, role = ?, linked_exporter_id = ?, linked_airline = ?`;

    if (String(password || '').trim().length) {
      const passwordHash = await bcrypt.hash(password, 10);
      sql += `, password_hash = ?`;
      params.splice(5, 0, passwordHash);
    }

    sql += ` WHERE id = ?`;
    await query(sql, params);

    return res.json({ message: "User updated" });
  } catch (error) {
    return next(error);
  }
}

async function deleteUser(req, res, next) {
  try {
    const { id } = req.params;

    if (Number(req.user.id) === Number(id)) {
      return res.status(400).json({ message: "You cannot delete your own account" });
    }

    const targetRows = await query(`SELECT id, role FROM users WHERE id = ? LIMIT 1`, [id]);
    if (!targetRows.length) {
      return res.status(404).json({ message: "User not found" });
    }

    if (targetRows[0].role === "admin") {
      if (!isMainAdminEmail(req.user?.email)) {
        return res.status(403).json({
          message: "Only the main administrator can delete another admin account."
        });
      }
      const adminCount = await getActiveAdminCount();
      if (adminCount <= 1) {
        return res.status(400).json({ message: "You cannot delete the last active admin" });
      }
    }

    await query(`DELETE FROM users WHERE id = ?`, [id]);
    return res.json({ message: "User deleted" });
  } catch (error) {
    return next(error);
  }
}

async function lockOrUnlockUser(req, res, next) {
  try {
    const { id } = req.params;
    const { is_locked, whatsapp_contact, lock_reason, admin_message } = req.body;

    if (typeof is_locked !== "boolean") {
      return res.status(400).json({ message: "is_locked must be a boolean" });
    }

    if (Number(req.user.id) === Number(id) && is_locked) {
      return res.status(400).json({ message: "You cannot lock your own account" });
    }

    const targetRows = await query(`SELECT id, role, full_name, email FROM users WHERE id = ? LIMIT 1`, [id]);
    if (!targetRows.length) {
      return res.status(404).json({ message: "User not found" });
    }

    if (targetRows[0].role === "admin" && is_locked) {
      const adminCount = await getActiveAdminCount();
      if (adminCount <= 1) {
        return res.status(400).json({ message: "You cannot lock the last active admin" });
      }
    }

    const rawPhone = String(whatsapp_contact || "").trim();
    const normalizedPhone = rawPhone.replace(/[\s()-]/g, "");

    if (is_locked && !normalizedPhone) {
      return res.status(400).json({ message: "Contact number is required when locking a user" });
    }

    if (normalizedPhone && !/^\+?[0-9]{10,15}$/.test(normalizedPhone)) {
      return res.status(400).json({ message: "Enter a valid contact number (10 to 15 digits, optional +)" });
    }

    // Update user with is_locked status and optionally whatsapp_contact
    let updateSql = `UPDATE users SET is_locked = ? `;
    let updateParams = [is_locked ? 1 : 0];
    
    if (is_locked && normalizedPhone) {
      updateSql += `, whatsapp_contact = ? `;
      updateParams.push(normalizedPhone);
    }
    
    updateSql += `WHERE id = ?`;
    updateParams.push(id);
    
    await query(updateSql, updateParams);

    if (is_locked && process.env.BREVO_API_KEY && targetRows[0].email) {
      const target = targetRows[0];
      const cleanReason = String(lock_reason || "").trim();
      const cleanAdminMessage = String(admin_message || "").trim();
      const supportContact = normalizedPhone || String(process.env.SUPPORT_PHONE || "").trim();

      const template = accountLockedEmail({
        name: target.full_name || "User",
        email: target.email,
        reason: cleanReason || null,
        adminMessage: cleanAdminMessage || null,
        supportContact: supportContact || null,
        supportEmail: process.env.SUPPORT_EMAIL || "support@sbu.rw"
      });

      const lines = [
        `Hello ${target.full_name || "User"},`,
        "",
        "Your account has been locked by an administrator."
      ];
      if (cleanReason) lines.push(`Reason: ${cleanReason}`);
      if (cleanAdminMessage) lines.push(`Admin message: ${cleanAdminMessage}`);
      lines.push("Please contact admin/support for help to unlock your account.");
      if (supportContact) lines.push(`Support contact number: ${supportContact}`);
      lines.push("", "Regards,", "SBU Export Coordination Hub");
      const emailMessage = lines.join("\n");
      
      // Send email
      await sendBrevoEmail({
        sender: getBrevoSender(),
        to: [{ email: target.email, name: target.full_name || "User" }],
        subject: "Your account has been locked - contact admin support",
        textContent: emailMessage,
        htmlContent: template.htmlContent
      });

      // Send WhatsApp notification immediately if contact provided
      let whatsappResult = { sent: false };
      if (normalizedPhone) {
        whatsappResult = await sendWhatsAppLockNotice(normalizedPhone, emailMessage);
      }

      await recordLockHistory({
        targetUserId: target.id,
        targetName: target.full_name,
        targetEmail: target.email,
        adminUserId: req.user.id,
        adminName: req.user.full_name,
        adminEmail: req.user.email,
        action: 'lock',
        contactNumber: normalizedPhone || null,
        lockReason: cleanReason || null,
        adminMessage: cleanAdminMessage || null,
        emailNotified: true,
        whatsappNotified: Boolean(whatsappResult.sent),
        whatsappStatus: whatsappResult.reason || 'sent'
      });

      return res.json({
        message: is_locked ? "User locked" : "User unlocked",
        email_notified: true,
        whatsapp_notified: Boolean(whatsappResult.sent),
        whatsapp_status: whatsappResult.reason || "sent"
      });
    }

    await recordLockHistory({
      targetUserId: targetRows[0].id,
      targetName: targetRows[0].full_name,
      targetEmail: targetRows[0].email,
      adminUserId: req.user.id,
      adminName: req.user.full_name,
      adminEmail: req.user.email,
      action: is_locked ? 'lock' : 'unlock',
      contactNumber: normalizedPhone || null,
      lockReason: String(lock_reason || '').trim() || null,
      adminMessage: String(admin_message || '').trim() || null,
      emailNotified: false,
      whatsappNotified: false,
      whatsappStatus: null
    });

    return res.json({ message: is_locked ? "User locked" : "User unlocked", email_notified: false, whatsapp_notified: false });
  } catch (error) {
    return next(error);
  }
}

module.exports = { listUsers, listLockHistory, getUser, lockOrUnlockUser, createUser, updateUser, deleteUser };
