const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { query } = require("../config/db");
const { sendBrevoEmail, getBrevoSender } = require("../utils/email");

const OTP_TTL_MINUTES = 10;
const TOKEN_TTL_MINUTES = 15;
const MAX_VERIFY_ATTEMPTS = 5;
const REQUEST_WINDOW_MIN = 15;
const REQUEST_MAX_PER_WINDOW = 4;
const FAILED_LOCKOUT_WINDOW_MIN = 60;
const FAILED_LOCKOUT_MAX = 8;

function clientIp(req) {
  return (
    req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    req.ip ||
    null
  );
}

function userAgent(req) {
  const ua = req.headers["user-agent"] || "";
  return String(ua).slice(0, 250) || null;
}

function generateNumericCode(len = 6) {
  const buf = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i += 1) out += String(buf[i] % 10);
  return out;
}

async function logEvent({ userId, email, action, success, req, details }) {
  try {
    await query(
      `INSERT INTO password_reset_logs (user_id, email, action, success, ip_address, user_agent, details)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId || null,
        email ? String(email).slice(0, 150) : null,
        action,
        success ? 1 : 0,
        clientIp(req),
        userAgent(req),
        details ? String(details).slice(0, 250) : null
      ]
    );
  } catch {
    /* logging never blocks the flow */
  }
}

function passwordIsStrong(pwd) {
  if (typeof pwd !== "string" || pwd.length < 8) return false;
  if (!/[a-z]/.test(pwd)) return false;
  if (!/[A-Z]/.test(pwd)) return false;
  if (!/[0-9]/.test(pwd)) return false;
  if (!/[^A-Za-z0-9]/.test(pwd)) return false;
  return true;
}

async function findUserByIdentifier(identifier) {
  const value = String(identifier || "").trim();
  if (!value) return null;
  if (value.includes("@")) {
    const rows = await query(
      `SELECT id, full_name, email, phone, role FROM users WHERE email = ? LIMIT 1`,
      [value.toLowerCase()]
    );
    return rows[0] || null;
  }
  const cleaned = value.replace(/\s+/g, "");
  const rows = await query(
    `SELECT id, full_name, email, phone, role FROM users WHERE phone = ? OR phone = ? LIMIT 1`,
    [cleaned, value]
  );
  return rows[0] || null;
}

async function sendOtpEmail({ user, code }) {
  if (!process.env.BREVO_API_KEY) return;
  if (!user?.email) return;
  const html = `
  <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:auto;padding:24px;background:#f5f9ff;border-radius:14px;border:1px solid #d9e7f7">
    <div style="background:linear-gradient(135deg,#0b51aa,#37a3f5);padding:18px 22px;border-radius:10px;color:#fff;margin-bottom:16px">
      <h2 style="margin:0;font-size:20px">Password reset request</h2>
      <p style="margin:6px 0 0 0;opacity:.9;font-size:13px">SBU Export Coordination Hub</p>
    </div>
    <p style="color:#0b1e36;font-size:15px;line-height:1.5">
      Hi ${user.full_name || "there"}, we received a request to reset the password on your SBU account.
    </p>
    <p style="color:#0b1e36;font-size:14px;margin:18px 0 8px 0">Your one-time verification code:</p>
    <div style="background:#fff;padding:18px;border-radius:10px;border:1px dashed #0b51aa;text-align:center;font-size:28px;letter-spacing:10px;font-weight:700;color:#0b51aa">
      ${code}
    </div>
    <p style="color:#465065;font-size:13px;margin-top:18px;line-height:1.5">
      This code will expire in <strong>${OTP_TTL_MINUTES} minutes</strong> and can be used only once.<br>
      If you did not request this, please ignore this email or contact <a href="mailto:security@sbu.rw">security@sbu.rw</a>.
    </p>
    <hr style="margin:22px 0;border:none;border-top:1px solid #d9e7f7"/>
    <p style="color:#94a0b4;font-size:11px;margin:0">
      Sent by SBU Export Coordination Hub · finance@sbu.rw · https://sbuexport.com
    </p>
  </div>`;

  await sendBrevoEmail({
    sender: getBrevoSender(),
    to: [{ email: user.email, name: user.full_name || user.email }],
    subject: "Your SBU password reset code",
    htmlContent: html,
    textContent: `Your SBU password reset code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`
  }).catch(() => {});
}

async function sendConfirmationEmail({ user, ip, ua, when }) {
  if (!process.env.BREVO_API_KEY) return;
  if (!user?.email) return;
  const html = `
  <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:auto;padding:24px;background:#f1faf3;border-radius:14px;border:1px solid #cbe9d3">
    <div style="background:linear-gradient(135deg,#0fa13a,#3bc463);padding:18px 22px;border-radius:10px;color:#fff;margin-bottom:16px">
      <h2 style="margin:0;font-size:20px">Password successfully changed</h2>
    </div>
    <p style="color:#0b1e36;font-size:14px;line-height:1.5">
      Hi ${user.full_name || "there"},<br>
      Your SBU account password was successfully changed.
    </p>
    <ul style="color:#0b1e36;font-size:13px;line-height:1.8">
      <li><strong>Date:</strong> ${when}</li>
      <li><strong>IP address:</strong> ${ip || "unknown"}</li>
      <li><strong>Device:</strong> ${(ua || "unknown").slice(0, 120)}</li>
    </ul>
    <p style="color:#465065;font-size:13px;line-height:1.5">
      All other active sessions have been signed out automatically.
      If you did not perform this action, contact <a href="mailto:security@sbu.rw">security@sbu.rw</a> immediately.
    </p>
  </div>`;

  await sendBrevoEmail({
    sender: getBrevoSender(),
    to: [{ email: user.email, name: user.full_name || user.email }],
    subject: "Your SBU password was changed",
    htmlContent: html,
    textContent: `Your SBU password was successfully changed on ${when} from ${ip || "unknown IP"}.`
  }).catch(() => {});
}

async function recentRequestCount({ userId, ip }) {
  const rows = await query(
    `SELECT COUNT(*) AS n FROM password_reset_logs
     WHERE action = 'request'
       AND created_at >= (NOW() - INTERVAL ? MINUTE)
       AND (user_id = ? OR ip_address = ?)`,
    [REQUEST_WINDOW_MIN, userId || -1, ip || ""]
  );
  return Number(rows[0]?.n || 0);
}

async function recentFailedCount({ ip }) {
  if (!ip) return 0;
  const rows = await query(
    `SELECT COUNT(*) AS n FROM password_reset_logs
     WHERE action IN ('failed','cooldown')
       AND created_at >= (NOW() - INTERVAL ? MINUTE)
       AND ip_address = ?`,
    [FAILED_LOCKOUT_WINDOW_MIN, ip]
  );
  return Number(rows[0]?.n || 0);
}

/** STEP 1 — request a reset code */
async function requestReset(req, res, next) {
  try {
    const { identifier, captcha } = req.body || {};
    const ip = clientIp(req);

    const failed = await recentFailedCount({ ip });
    if (failed >= FAILED_LOCKOUT_MAX) {
      await logEvent({ email: identifier, action: "cooldown", success: false, req, details: "ip-cooldown" });
      return res.status(429).json({
        message: "Too many attempts from your network. Please try again in an hour.",
        cooldown: true
      });
    }

    /* honeypot / "captcha" — front-end fills `captcha` with the answer to a tiny math challenge.
       It must be present and a number. */
    if (failed >= 3 && (typeof captcha !== "number" || Number.isNaN(captcha))) {
      await logEvent({ email: identifier, action: "captcha", success: false, req });
      return res.status(400).json({ message: "Please complete the verification challenge.", captcha_required: true });
    }

    const user = await findUserByIdentifier(identifier);

    /* Always answer 200 to avoid account-enumeration */
    if (!user) {
      await logEvent({ email: identifier, action: "request", success: false, req, details: "no-such-account" });
      return res.json({
        message: "If an account exists for that contact, a reset code has been sent.",
        delivery: { masked_email: null, masked_phone: null }
      });
    }

    const recent = await recentRequestCount({ userId: user.id, ip });
    if (recent >= REQUEST_MAX_PER_WINDOW) {
      await logEvent({ userId: user.id, email: user.email, action: "cooldown", success: false, req });
      return res.status(429).json({
        message: `Too many reset requests. Please wait ${REQUEST_WINDOW_MIN} minutes before trying again.`
      });
    }

    /* Invalidate previous unused codes */
    await query(
      `UPDATE password_reset_codes
       SET used_at = NOW()
       WHERE user_id = ? AND used_at IS NULL`,
      [user.id]
    );

    const code = generateNumericCode(6);
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await query(
      `INSERT INTO password_reset_codes (user_id, code_hash, ip_address, user_agent, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [user.id, codeHash, ip, userAgent(req), expiresAt]
    );

    await sendOtpEmail({ user, code }).catch(() => {});

    await logEvent({ userId: user.id, email: user.email, action: "request", success: true, req });

    const masked_email = user.email
      ? user.email.replace(/(.).+(@.+)/, (_, a, b) => `${a}***${b}`)
      : null;
    const masked_phone = user.phone
      ? user.phone.replace(/.(?=.{3})/g, "•")
      : null;

    const debugCode = process.env.NODE_ENV !== "production" ? code : undefined;

    return res.json({
      message: "If an account exists for that contact, a reset code has been sent.",
      delivery: { masked_email, masked_phone },
      ...(debugCode ? { dev_otp: debugCode } : {})
    });
  } catch (error) {
    return next(error);
  }
}

/** STEP 2 — verify the OTP and exchange it for a short-lived reset_token */
async function verifyReset(req, res, next) {
  try {
    const { identifier, code } = req.body || {};
    if (!identifier || !code) {
      return res.status(400).json({ message: "Identifier and code are required." });
    }

    const user = await findUserByIdentifier(identifier);
    if (!user) {
      await logEvent({ email: identifier, action: "failed", success: false, req, details: "verify-no-user" });
      return res.status(400).json({ message: "Invalid or expired code." });
    }

    const rows = await query(
      `SELECT id, code_hash, attempts, used_at, expires_at
       FROM password_reset_codes
       WHERE user_id = ? AND used_at IS NULL
       ORDER BY id DESC LIMIT 1`,
      [user.id]
    );
    const otp = rows[0];
    if (!otp) {
      await logEvent({ userId: user.id, email: user.email, action: "failed", success: false, req, details: "no-active-code" });
      return res.status(400).json({ message: "Invalid or expired code." });
    }

    if (new Date(otp.expires_at).getTime() < Date.now()) {
      await query(`UPDATE password_reset_codes SET used_at = NOW() WHERE id = ?`, [otp.id]);
      await logEvent({ userId: user.id, email: user.email, action: "failed", success: false, req, details: "expired" });
      return res.status(400).json({ message: "This code has expired. Please request a new one." });
    }

    if (otp.attempts >= MAX_VERIFY_ATTEMPTS) {
      await query(`UPDATE password_reset_codes SET used_at = NOW() WHERE id = ?`, [otp.id]);
      await logEvent({ userId: user.id, email: user.email, action: "failed", success: false, req, details: "max-attempts" });
      return res.status(429).json({ message: "Too many wrong attempts. Please request a new code." });
    }

    const ok = await bcrypt.compare(String(code).trim(), otp.code_hash);
    if (!ok) {
      await query(`UPDATE password_reset_codes SET attempts = attempts + 1 WHERE id = ?`, [otp.id]);
      await logEvent({ userId: user.id, email: user.email, action: "failed", success: false, req, details: "wrong-code" });
      return res.status(400).json({ message: "Invalid code. Please try again." });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const tokenExpiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);
    await query(
      `UPDATE password_reset_codes
       SET reset_token = ?, verified_at = NOW(), expires_at = ?
       WHERE id = ?`,
      [resetToken, tokenExpiresAt, otp.id]
    );

    await logEvent({ userId: user.id, email: user.email, action: "verify", success: true, req });

    return res.json({
      message: "Code verified. You may now set a new password.",
      reset_token: resetToken,
      expires_in_minutes: TOKEN_TTL_MINUTES
    });
  } catch (error) {
    return next(error);
  }
}

/** STEP 3 — set the new password using the reset_token */
async function resetPassword(req, res, next) {
  try {
    const { reset_token, new_password } = req.body || {};
    if (!reset_token || !new_password) {
      return res.status(400).json({ message: "reset_token and new_password are required." });
    }

    if (!passwordIsStrong(new_password)) {
      return res.status(400).json({
        message:
          "Password must be at least 8 characters and include an uppercase letter, lowercase letter, number and special character."
      });
    }

    const rows = await query(
      `SELECT id, user_id, expires_at, used_at, verified_at
       FROM password_reset_codes
       WHERE reset_token = ? LIMIT 1`,
      [reset_token]
    );
    const otp = rows[0];
    if (!otp || otp.used_at || !otp.verified_at) {
      await logEvent({ action: "failed", success: false, req, details: "invalid-token" });
      return res.status(400).json({ message: "Invalid or expired reset token." });
    }
    if (new Date(otp.expires_at).getTime() < Date.now()) {
      await logEvent({ userId: otp.user_id, action: "failed", success: false, req, details: "token-expired" });
      return res.status(400).json({ message: "Reset token has expired." });
    }

    const userRows = await query(
      `SELECT id, full_name, email, phone, role FROM users WHERE id = ? LIMIT 1`,
      [otp.user_id]
    );
    const user = userRows[0];
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const passwordHash = await bcrypt.hash(new_password, 10);
    await query(
      `UPDATE users SET password_hash = ?, password_changed_at = NOW() WHERE id = ?`,
      [passwordHash, user.id]
    );

    /* invalidate this and any other unused codes for the user */
    await query(
      `UPDATE password_reset_codes SET used_at = NOW()
       WHERE user_id = ? AND used_at IS NULL`,
      [user.id]
    );

    /* unlock the account if it was previously locked because of bad-password loops */
    await query(`UPDATE users SET is_locked = 0 WHERE id = ?`, [user.id]);

    const ip = clientIp(req);
    const ua = userAgent(req);
    const when = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
    await logEvent({ userId: user.id, email: user.email, action: "reset", success: true, req, details: "password-changed" });
    sendConfirmationEmail({ user, ip, ua, when }).catch(() => {});

    return res.json({
      message: "Your password was successfully changed. All other sessions were signed out.",
      sessions_invalidated: true
    });
  } catch (error) {
    return next(error);
  }
}

/** Admin — list reset logs */
async function listResetLogs(req, res, next) {
  try {
    const { q, action, limit } = req.query || {};
    const params = [];
    let sql = `
      SELECT l.*, u.full_name AS user_name, u.role AS user_role
      FROM password_reset_logs l
      LEFT JOIN users u ON l.user_id = u.id
      WHERE 1 = 1
    `;
    if (action && ["request", "verify", "reset", "failed", "cooldown", "captcha"].includes(action)) {
      sql += " AND l.action = ?";
      params.push(action);
    }
    if (q && String(q).trim()) {
      const like = `%${String(q).trim()}%`;
      sql += " AND (l.email LIKE ? OR u.full_name LIKE ? OR l.ip_address LIKE ?)";
      params.push(like, like, like);
    }
    sql += " ORDER BY l.created_at DESC LIMIT ?";
    const lim = Math.min(Math.max(Number(limit) || 200, 1), 1000);
    params.push(lim);

    const rows = await query(sql, params);
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  requestReset,
  verifyReset,
  resetPassword,
  listResetLogs,
  passwordIsStrong
};
