const bcrypt = require("bcryptjs");
const { query } = require("../config/db");

async function ensureAdminUser() {
  const adminEmail = (process.env.ADMIN_EMAIL || "").trim();
  const adminPassword = process.env.ADMIN_PASSWORD || "";
  const adminFullName = (process.env.ADMIN_FULL_NAME || "System Admin").trim();

  if (!adminEmail || !adminPassword) {
    console.log("Admin bootstrap skipped: set ADMIN_EMAIL and ADMIN_PASSWORD in .env");
    return;
  }

  const existing = await query(
    `SELECT id, role FROM users WHERE email = ? LIMIT 1`,
    [adminEmail]
  );

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  if (existing.length) {
    await query(
      `UPDATE users
       SET full_name = ?, password_hash = ?, role = 'admin', is_active = 1
       WHERE id = ?`,
      [adminFullName, passwordHash, existing[0].id]
    );
    console.log(`Admin bootstrap: synchronized credentials for ${adminEmail}`);
    return;
  }

  await query(
    `INSERT INTO users (full_name, email, password_hash, role, linked_exporter_id, linked_airline)
     VALUES (?, ?, ?, 'admin', NULL, NULL)`,
    [adminFullName, adminEmail, passwordHash]
  );

  console.log(`Admin bootstrap: created admin user ${adminEmail}`);
}

module.exports = { ensureAdminUser };
