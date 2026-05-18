const cron = require("node-cron");
const dayjs = require("dayjs");
const { query } = require("../config/db");
const { INVOICE_SETTINGS, ROLES } = require("../config/constants");
const { getExporterPricingConfig, countBillableAwbs } = require("./exporterPricing");
const { generateInvoiceNumber, calculateNoShowCharge } = require("../utils/invoice");
const { pushNotification } = require("../utils/notifications");
const { sendBrevoEmail, getBrevoSender } = require("../utils/email");

async function createOrReuseInvoice(exporterId, startDate, endDate, prefix = "INV") {
  const existing = await query(
    `SELECT id FROM invoices WHERE exporter_id = ? AND start_date = ? AND end_date = ? LIMIT 1`,
    [exporterId, startDate, endDate]
  );

  if (existing.length) return existing[0].id;

  const result = await query(
    `INSERT INTO invoices (invoice_number, exporter_id, start_date, end_date, total_amount, status, due_date)
     VALUES (?, ?, ?, ?, 0, 'pending', ?)`,
    [
      generateInvoiceNumber(prefix),
      exporterId,
      startDate,
      endDate,
      dayjs(endDate).add(INVOICE_SETTINGS.OVERDUE_DAYS, "day").format("YYYY-MM-DD")
    ]
  );

  return result.insertId;
}

async function recalculateInvoice(invoiceId) {
  await query(
    `UPDATE invoices i
     SET i.total_amount = COALESCE((SELECT SUM(total_price) FROM invoice_lines WHERE invoice_id = i.id), 0)
     WHERE i.id = ?`,
    [invoiceId]
  );
}

async function processNoShowInvoices() {
  const targetDate = dayjs().subtract(1, "day").format("YYYY-MM-DD");
  const rows = await query(
    `SELECT b.id booking_id, b.exporter_id, b.tonnage_kg
     FROM bookings b
     LEFT JOIN daily_confirmations dc ON dc.booking_id = b.id AND dc.confirm_date = b.flight_date
     WHERE b.flight_date = ? AND b.status = 'approved' AND (dc.id IS NULL OR dc.status <> 'confirmed')`,
    [targetDate]
  );

  for (const row of rows) {
    const marker = await query(
      `SELECT id FROM daily_confirmations WHERE booking_id = ? AND confirm_date = ? AND status = 'missed' LIMIT 1`,
      [row.booking_id, targetDate]
    );

    if (marker.length) continue;

    await query(
      `INSERT INTO daily_confirmations (booking_id, confirm_date, status, confirmed_at)
       VALUES (?, ?, 'missed', NULL)`,
      [row.booking_id, targetDate]
    );

    const invoiceId = await createOrReuseInvoice(row.exporter_id, targetDate, targetDate, "NOSHOW");
    const noShow = calculateNoShowCharge(Number(row.tonnage_kg));

    await query(
      `INSERT INTO invoice_lines (invoice_id, booking_id, description, quantity_kg, unit_price, total_price)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        invoiceId,
        row.booking_id,
        "70% no-show charge (9 AM confirmation missed)",
        noShow.chargeableKg,
        INVOICE_SETTINGS.DEFAULT_PRICE_PER_KG,
        noShow.amount
      ]
    );

    await recalculateInvoice(invoiceId);
  }
}

async function processWeeklyInvoices() {
  const today = dayjs();
  const startDate = today.subtract(1, "week").startOf("week").add(1, "day").format("YYYY-MM-DD");
  const endDate = today.subtract(1, "week").endOf("week").add(1, "day").format("YYYY-MM-DD");

  const confirmed = await query(
    `SELECT b.exporter_id, b.id AS booking_id,
            MAX(CASE WHEN uc.confirmer_role = 'airline_analyst' THEN uc.actual_kg END) AS airline_kg,
            MAX(CASE WHEN uc.confirmer_role = 'clearing_agent' THEN uc.actual_kg END) AS clearing_kg,
            LEAST(
              MAX(CASE WHEN uc.confirmer_role = 'airline_analyst' THEN uc.actual_kg END),
              MAX(CASE WHEN uc.confirmer_role = 'clearing_agent' THEN uc.actual_kg END)
            ) AS matched_kg
     FROM bookings b
     JOIN uplift_confirmations uc ON uc.booking_id = b.id
     WHERE b.flight_date BETWEEN ? AND ?
     GROUP BY b.exporter_id, b.id
     HAVING airline_kg IS NOT NULL
        AND clearing_kg IS NOT NULL
        AND matched_kg > 0
        AND ABS(airline_kg - clearing_kg) < 0.01`,
    [startDate, endDate]
  );

  for (const row of confirmed) {
    const invoiceId = await createOrReuseInvoice(row.exporter_id, startDate, endDate, "WEEKLY");

    const exists = await query(`SELECT id FROM invoice_lines WHERE invoice_id = ? AND booking_id = ? LIMIT 1`, [
      invoiceId,
      row.booking_id
    ]);
    if (exists.length) continue;

    const cfg = await getExporterPricingConfig(row.exporter_id);
    const usePerAwb = cfg.model === "per_awb" && cfg.pricePerAwb != null && Number.isFinite(cfg.pricePerAwb);
    let quantity;
    let unitPrice;
    let total;
    let description = "Weekly uplift confirmed by airline and clearing agent";
    if (usePerAwb) {
      const { count } = await countBillableAwbs(row.booking_id);
      quantity = count;
      unitPrice = cfg.pricePerAwb;
      total = +(quantity * unitPrice).toFixed(2);
      description += " (per AWB)";
    } else {
      quantity = Number(row.matched_kg);
      unitPrice = cfg.pricePerKg;
      total = +(quantity * unitPrice).toFixed(2);
    }

    await query(
      `INSERT INTO invoice_lines (invoice_id, booking_id, description, quantity_kg, unit_price, total_price)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [invoiceId, row.booking_id, description, quantity, unitPrice, total]
    );

    await recalculateInvoice(invoiceId);
  }
}

async function sendNineAmReminders() {
  const today = dayjs().format("YYYY-MM-DD");
  const approvedBookings = await query(
    `SELECT b.id, b.exporter_id, b.flight_date, b.destination, b.tonnage_kg, u.id AS user_id, u.full_name, u.email
     FROM bookings b
     JOIN users u ON u.linked_exporter_id = b.exporter_id AND u.role = 'exporter'
     LEFT JOIN daily_confirmations dc ON dc.booking_id = b.id AND dc.confirm_date = b.flight_date
     WHERE b.flight_date = ? AND b.status = 'approved' AND (dc.id IS NULL OR dc.status <> 'confirmed')`,
    [today]
  );

  if (!approvedBookings.length) return;

  const grouped = new Map();
  for (const row of approvedBookings) {
    const key = row.user_id;
    if (!grouped.has(key)) {
      grouped.set(key, { user_id: row.user_id, full_name: row.full_name, email: row.email, bookings: [] });
    }
    grouped.get(key).bookings.push(row);
  }

  const sender = process.env.BREVO_API_KEY ? getBrevoSender() : null;

  for (const recipient of grouped.values()) {
    const lines = recipient.bookings.map((booking) => `• Booking #${booking.id} - ${booking.destination} on ${booking.flight_date} (${Number(booking.tonnage_kg || 0).toLocaleString('en-US')} kg)`);
    const textContent = `Good morning ${recipient.full_name || "Exporter"},\n\nPlease confirm your approved bookings before 9:00 AM today to avoid no-show processing.\n\n${lines.join("\n")}\n\nOpen your dashboard to confirm uplift.\n\nRegards,\nSBU Cargo Hub`;

    await pushNotification(
      recipient.user_id,
      "9 AM confirmation reminder",
      `Please confirm approved bookings before 9:00 AM today. You have ${recipient.bookings.length} booking(s) awaiting confirmation.`,
      "warning"
    );

    if (sender && recipient.email) {
      await sendBrevoEmail({
        sender,
        to: [{ email: recipient.email, name: recipient.full_name || "Exporter" }],
        subject: "9 AM booking confirmation reminder",
        textContent
      });
    }
  }
}

async function lockOverdueAccounts() {
  const overdue = await query(`SELECT DISTINCT i.exporter_id FROM invoices i WHERE i.status = 'pending' AND i.due_date < CURRENT_DATE()`);

  for (const row of overdue) {
    await query(`UPDATE exporters SET is_locked = 1 WHERE id = ?`, [row.exporter_id]);
    await query(`UPDATE users SET is_locked = 1 WHERE linked_exporter_id = ? AND role IN (?, ?)`, [
      row.exporter_id,
      ROLES.EXPORTER,
      ROLES.CLEARING_AGENT
    ]);
  }
}

function startScheduler() {
  cron.schedule("0 9 * * *", async () => {
    await sendNineAmReminders();
  });

  cron.schedule("5 9 * * *", async () => {
    await processNoShowInvoices();
  });

  cron.schedule("0 10 * * 3", async () => {
    await processWeeklyInvoices();
  });

  cron.schedule("0 8 * * *", async () => {
    await lockOverdueAccounts();
  });
}

module.exports = {
  startScheduler,
  processNoShowInvoices,
  processWeeklyInvoices,
  lockOverdueAccounts,
  sendNineAmReminders
};
