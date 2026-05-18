const { query } = require("../config/db");

async function addColumnIfMissing(table, column, definition) {
  try {
    const cols = await query(`SHOW COLUMNS FROM ${table} LIKE '${column}'`);
    if (!cols.length) {
      await query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  } catch {}
}

async function runMigrations() {
  try {
    // ── bookings ────────────────────────────────────────────────────────────
    await addColumnIfMissing("bookings", "bsa_type", "ENUM('BSA','Non-BSA') NULL");
    await addColumnIfMissing("bookings", "transit_airport", "VARCHAR(120) NULL");
    await addColumnIfMissing("uplift_notifications", "is_read", "TINYINT(1) NOT NULL DEFAULT 0");

    // ── exporters ────────────────────────────────────────────────────────────
    await addColumnIfMissing("exporters", "whatsapp_contact", "VARCHAR(20) NULL");
    await addColumnIfMissing("exporters", "logo_url", "VARCHAR(400) NULL");
    await addColumnIfMissing("exporters", "website", "VARCHAR(400) NULL");
    await addColumnIfMissing("exporters", "is_locked", "TINYINT(1) NOT NULL DEFAULT 0");

    // ── documents ────────────────────────────────────────────────────────────
    await addColumnIfMissing("documents", "doc_name_pattern", "VARCHAR(255) NULL");
    await addColumnIfMissing("documents", "awb_code", "VARCHAR(80) NULL");

    // ── capacities ──────────────────────────────────────────────────────────
    await addColumnIfMissing("capacities", "pmc_details", "VARCHAR(255) NULL");

    // ── uplift_notifications ─────────────────────────────────────────────────
    await addColumnIfMissing("uplift_notifications", "is_read", "TINYINT(1) NOT NULL DEFAULT 0");
    await addColumnIfMissing("uplift_notifications", "awb_type", "VARCHAR(50) NULL");
    await addColumnIfMissing("uplift_notifications", "explanation", "VARCHAR(500) NULL");
    await addColumnIfMissing("uplift_notifications", "kg_confirmation", "DECIMAL(12,2) NULL");
    await addColumnIfMissing("uplift_notifications", "document_upload_path", "VARCHAR(400) NULL");
    await addColumnIfMissing("uplift_notifications", "flight_number", "VARCHAR(20) NULL");
    await addColumnIfMissing("uplift_notifications", "onward_destination", "VARCHAR(120) NULL");
    await addColumnIfMissing("uplift_notifications", "onward_flight", "VARCHAR(20) NULL");
    await addColumnIfMissing("uplift_notifications", "skids", "INT NULL");
    await addColumnIfMissing("uplift_notifications", "message", "TEXT NULL");

    // ── uplift_confirmations: add uplift_agent to confirmer_role ENUM ────────
    try {
      await query(`
        ALTER TABLE uplift_confirmations
        MODIFY COLUMN confirmer_role
          ENUM('airline_analyst','airline_supervisor','clearing_agent') NOT NULL
      `);
    } catch {}

    // ── hero_media: allow image type ─────────────────────────────────────────
    try {
      await query(`
        ALTER TABLE hero_media
        MODIFY COLUMN media_type ENUM('video','image') NOT NULL DEFAULT 'video'
      `);
    } catch {}

    // ── hero_media: admin-controlled audio mute flag ─────────────────────────
    try {
      await query(`
        ALTER TABLE hero_media
        ADD COLUMN is_muted TINYINT(1) NOT NULL DEFAULT 0
      `);
    } catch {}

    // ── broadcast_notifications table ─────────────────────────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS broadcast_notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sender_id INT NOT NULL,
        title VARCHAR(150) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(30) NOT NULL DEFAULT 'info',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_broadcast_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // ── uplift_sms_logs table ─────────────────────────────────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS uplift_sms_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        booking_id INT NOT NULL,
        sender_id INT NOT NULL,
        exporter_id INT NOT NULL,
        sms_type ENUM('loaded', 'offloaded', 'partial', 'custom') NOT NULL,
        destination VARCHAR(120) NULL,
        reason VARCHAR(255) NULL,
        custom_message TEXT NULL,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_sms_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
        CONSTRAINT fk_sms_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_sms_exporter FOREIGN KEY (exporter_id) REFERENCES exporters(id) ON DELETE CASCADE
      )
    `);

    // ── uplift_confirmations table (in case it was missed) ────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS uplift_confirmations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        booking_id INT NOT NULL,
        confirmer_role ENUM('airline_analyst','airline_supervisor','clearing_agent','uplift_agent') NOT NULL,
        confirmer_user_id INT NOT NULL,
        actual_kg DECIMAL(12,2) NOT NULL,
        confirmed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_uplift_role (booking_id, confirmer_role),
        CONSTRAINT fk_uplift_conf_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
        CONSTRAINT fk_uplift_conf_user FOREIGN KEY (confirmer_user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // ── daily_confirmations table (in case it was missed) ─────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS daily_confirmations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        booking_id INT NOT NULL,
        confirm_date DATE NOT NULL,
        status ENUM('confirmed', 'missed') NOT NULL,
        confirmed_at DATETIME NULL,
        UNIQUE KEY uniq_daily_confirm (booking_id, confirm_date),
        CONSTRAINT fk_daily_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
      )
    `);

    // ── invoice_lines table (in case it was missed) ───────────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS invoice_lines (
        id INT AUTO_INCREMENT PRIMARY KEY,
        invoice_id INT NOT NULL,
        booking_id INT NULL,
        description VARCHAR(255) NOT NULL,
        quantity_kg DECIMAL(12,2) NOT NULL,
        unit_price DECIMAL(10,2) NOT NULL,
        total_price DECIMAL(12,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_line_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
        CONSTRAINT fk_line_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL
      )
    `);

    // ── user_lock_history table (in case it was missed) ───────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id INT NOT NULL PRIMARY KEY,
        maintenance_mode TINYINT(1) NOT NULL DEFAULT 0,
        maintenance_message VARCHAR(500) NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    await query(`
      INSERT IGNORE INTO system_settings (id, maintenance_mode, maintenance_message)
      VALUES (1, 0, NULL)
    `);

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
        CONSTRAINT fk_lock_history_target_user FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT fk_lock_history_admin_user FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // ── airlines: add from-destination column ────────────────────────────────
    await addColumnIfMissing("airlines", "from_destination", "VARCHAR(120) NULL");

    // ── airline_destinations table (airline → destinations many-to-many) ─────
    await query(`
      CREATE TABLE IF NOT EXISTS airline_destinations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        airline_id INT NOT NULL,
        destination VARCHAR(150) NOT NULL,
        is_transit TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_airline_destination (airline_id, destination),
        CONSTRAINT fk_airline_dest FOREIGN KEY (airline_id) REFERENCES airlines(id) ON DELETE CASCADE
      )
    `);

    // ── customers (homepage "Our Customers" — admin managed) ─────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS homepage_customers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        description VARCHAR(500) NULL,
        website VARCHAR(400) NULL,
        logo_path VARCHAR(400) NULL,
        sort_order INT NOT NULL DEFAULT 0,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // ── password reset / security: per-user password change tracker ─────────
    await addColumnIfMissing("users", "password_changed_at", "TIMESTAMP NULL DEFAULT NULL");
    await addColumnIfMissing("users", "phone", "VARCHAR(25) NULL");

    // ── password_reset_codes (hashed OTPs, single-use, expiring) ─────────────
    await query(`
      CREATE TABLE IF NOT EXISTS password_reset_codes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        code_hash VARCHAR(120) NOT NULL,
        reset_token VARCHAR(120) NULL,
        ip_address VARCHAR(60) NULL,
        user_agent VARCHAR(255) NULL,
        attempts INT NOT NULL DEFAULT 0,
        used_at DATETIME NULL DEFAULT NULL,
        expires_at DATETIME NULL DEFAULT NULL,
        verified_at DATETIME NULL DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_reset_codes_user (user_id),
        INDEX idx_reset_codes_token (reset_token),
        CONSTRAINT fk_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // ── password_reset_logs (admin visibility / audit) ───────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS password_reset_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        email VARCHAR(150) NULL,
        action ENUM('request','verify','reset','failed','cooldown','captcha') NOT NULL,
        success TINYINT(1) NOT NULL DEFAULT 0,
        ip_address VARCHAR(60) NULL,
        user_agent VARCHAR(255) NULL,
        details VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_reset_log_user (user_id),
        INDEX idx_reset_log_email (email),
        INDEX idx_reset_log_created (created_at)
      )
    `);

    // ── exporter_pricing: price-per-kg per exporter (admin-managed) ──────────
    await query(`
      CREATE TABLE IF NOT EXISTS exporter_pricing (
        id INT AUTO_INCREMENT PRIMARY KEY,
        exporter_id INT NOT NULL UNIQUE,
        price_per_kg DECIMAL(10,4) NOT NULL DEFAULT 5.0000,
        pricing_model ENUM('per_kg','per_awb') NOT NULL DEFAULT 'per_kg',
        price_per_awb DECIMAL(10,4) NULL,
        currency VARCHAR(8) NOT NULL DEFAULT 'USD',
        notes VARCHAR(255) NULL,
        updated_by INT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_pricing_exporter FOREIGN KEY (exporter_id) REFERENCES exporters(id) ON DELETE CASCADE
      )
    `);
    await addColumnIfMissing(
      "exporter_pricing",
      "pricing_model",
      "ENUM('per_kg','per_awb') NOT NULL DEFAULT 'per_kg'"
    );
    await addColumnIfMissing("exporter_pricing", "price_per_awb", "DECIMAL(10,4) NULL");

    console.log("Migrations applied successfully.");
  } catch (err) {
    console.error("Migration warning:", err.message);
  }
}

module.exports = { runMigrations };
