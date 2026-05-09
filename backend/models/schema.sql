CREATE DATABASE IF NOT EXISTS sbu_export_hub;
USE sbu_export_hub;

CREATE TABLE IF NOT EXISTS exporters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  contact_email VARCHAR(150) NOT NULL,
  whatsapp_contact VARCHAR(20) NULL,
  logo_url VARCHAR(400) NULL,
  website VARCHAR(400) NULL,
  is_locked TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS airlines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  code VARCHAR(20) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('exporter', 'airline_analyst', 'airline_supervisor', 'clearing_agent', 'uplift_agent', 'admin') NOT NULL,
  linked_exporter_id INT NULL,
  linked_airline VARCHAR(120) NULL,
  whatsapp_contact VARCHAR(20) NULL,
  is_locked TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_exporter FOREIGN KEY (linked_exporter_id) REFERENCES exporters(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS capacities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  airline_id INT NOT NULL,
  flight_date DATE NOT NULL,
  destination VARCHAR(120) NOT NULL,
  total_skids DECIMAL(10,2) NOT NULL,
  total_kg DECIMAL(12,2) NOT NULL,
  booked_skids DECIMAL(10,2) NOT NULL DEFAULT 0,
  booked_kg DECIMAL(12,2) NOT NULL DEFAULT 0,
  pmc_details VARCHAR(255) NULL,
  status ENUM('green', 'yellow', 'red') NOT NULL DEFAULT 'green',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_capacity (airline_id, flight_date, destination),
  CONSTRAINT fk_capacity_airline FOREIGN KEY (airline_id) REFERENCES airlines(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bookings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  exporter_id INT NOT NULL,
  airline_id INT NOT NULL,
  flight_date DATE NOT NULL,
  destination VARCHAR(120) NOT NULL,
  skids DECIMAL(10,2) NOT NULL,
  tonnage_kg DECIMAL(12,2) NOT NULL,
  commodity VARCHAR(120) NOT NULL,
  bsa_type ENUM('BSA', 'Non-BSA') NULL,
  status ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
  pending_reason VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_booking_exporter FOREIGN KEY (exporter_id) REFERENCES exporters(id) ON DELETE CASCADE,
  CONSTRAINT fk_booking_airline FOREIGN KEY (airline_id) REFERENCES airlines(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS daily_confirmations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  confirm_date DATE NOT NULL,
  status ENUM('confirmed', 'missed') NOT NULL,
  confirmed_at DATETIME NULL,
  UNIQUE KEY uniq_daily_confirm (booking_id, confirm_date),
  CONSTRAINT fk_daily_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS uplift_notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  airline_analyst_id INT NOT NULL,
  actual_kg DECIMAL(12,2) NOT NULL,
  awb_number VARCHAR(80) NOT NULL,
  awb_type VARCHAR(50) NULL,
  uplift_type ENUM('full', 'half', 'offload') NOT NULL DEFAULT 'full',
  reason VARCHAR(255) NULL,
  explanation VARCHAR(500) NULL,
  message TEXT NULL,
  kg_confirmation DECIMAL(12,2) NULL,
  document_upload_path VARCHAR(400) NULL,
  flight_number VARCHAR(20) NULL,
  onward_destination VARCHAR(120) NULL,
  onward_flight VARCHAR(20) NULL,
  skids INT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_uplift_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT fk_uplift_user FOREIGN KEY (airline_analyst_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS uplift_confirmations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  confirmer_role ENUM('airline_analyst', 'airline_supervisor', 'clearing_agent') NOT NULL,
  confirmer_user_id INT NOT NULL,
  actual_kg DECIMAL(12,2) NOT NULL,
  confirmed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_uplift_role (booking_id, confirmer_role),
  CONSTRAINT fk_uplift_conf_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT fk_uplift_conf_user FOREIGN KEY (confirmer_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  exporter_id INT NOT NULL,
  uploaded_by INT NOT NULL,
  booking_id INT NULL,
  doc_type VARCHAR(80) NOT NULL,
  doc_name_pattern VARCHAR(255) NULL,
  awb_code VARCHAR(80) NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(300) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  size_bytes BIGINT NOT NULL,
  share_token VARCHAR(100) NULL UNIQUE,
  share_expires_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_doc_exporter FOREIGN KEY (exporter_id) REFERENCES exporters(id) ON DELETE CASCADE,
  CONSTRAINT fk_doc_user FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_doc_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_number VARCHAR(80) NOT NULL UNIQUE,
  exporter_id INT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  status ENUM('pending', 'paid', 'overdue') NOT NULL DEFAULT 'pending',
  due_date DATE NOT NULL,
  paid_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_invoice_exporter FOREIGN KEY (exporter_id) REFERENCES exporters(id) ON DELETE CASCADE
);

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
);

CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(150) NOT NULL,
  message VARCHAR(255) NOT NULL,
  type VARCHAR(30) NOT NULL DEFAULT 'info',
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS hero_media (
  id INT AUTO_INCREMENT PRIMARY KEY,
  media_type ENUM('video') NOT NULL DEFAULT 'video',
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(400) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  uploaded_by INT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_hero_media_user FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS broadcast_notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sender_id INT NOT NULL,
  title VARCHAR(150) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(30) NOT NULL DEFAULT 'info',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_broadcast_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
);

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
);

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
);
