const { query } = require("../config/db");
const { computeStatus } = require("../utils/capacity");
const { emitCapacityUpdate } = require("../config/socket");
const { pushNotification } = require("../utils/notifications");
const { sendBrevoEmail, getBrevoSender } = require("../utils/email");
const { bookingReceivedEmail, bookingCancelledEmail } = require("../utils/emailTemplates");
const { getExporterPriceForBilling } = require("./financeController");
let upliftHasReadColumn = null;
let upliftHasUpdatedAtColumn = null;
const upliftColumnCache = new Map();

async function notifyAnalystsAndAdminsForAirline(airlineId, title, message, type = "info") {
  const airlineRows = await query(`SELECT name FROM airlines WHERE id = ? LIMIT 1`, [airlineId]);
  const airlineName = airlineRows[0]?.name || "";
  const recipients = new Map();

  if (airlineName) {
    const analysts = await query(
      `SELECT id FROM users WHERE role = 'airline_analyst' AND is_active = 1 AND linked_airline = ?`,
      [airlineName]
    );
    for (const row of analysts) recipients.set(row.id, true);
  }

  const admins = await query(`SELECT id FROM users WHERE role = 'admin' AND is_active = 1`);
  for (const row of admins) recipients.set(row.id, true);

  for (const userId of recipients.keys()) {
    await pushNotification(userId, title, message, type);
  }
}

async function adjustCapacityReservation({ airline_id, flight_date, destination, skids, tonnage_kg }, mode) {
  const caps = await query(
    `SELECT id, airline_id, flight_date, destination, total_skids, total_kg, booked_skids, booked_kg
     FROM capacities
     WHERE airline_id = ? AND DATE(flight_date) = DATE(?) AND UPPER(TRIM(destination)) = UPPER(TRIM(?))
     LIMIT 1`,
    [airline_id, flight_date, destination]
  );

  if (!caps.length) return { ok: false, reason: "no-capacity" };

  const c = caps[0];
  const deltaSkids = Number(skids || 0);
  const deltaKg = Number(tonnage_kg || 0);

  let bookedSkids = Number(c.booked_skids);
  let bookedKg = Number(c.booked_kg);

  if (mode === "reserve") {
    if (bookedSkids + deltaSkids > Number(c.total_skids) || bookedKg + deltaKg > Number(c.total_kg)) {
      return { ok: false, reason: "exceeds" };
    }
    bookedSkids += deltaSkids;
    bookedKg += deltaKg;
  } else {
    bookedSkids = Math.max(0, bookedSkids - deltaSkids);
    bookedKg = Math.max(0, bookedKg - deltaKg);
  }

  const freeKg = Number(c.total_kg) - bookedKg;
  const newStatus = computeStatus(freeKg, Number(c.total_kg));

  await query(
    `UPDATE capacities SET booked_skids = ?, booked_kg = ?, status = ?, updated_at = NOW() WHERE id = ?`,
    [bookedSkids, bookedKg, newStatus, c.id]
  );

  emitCapacityUpdate({
    capacityId: c.id,
    airline_id: c.airline_id,
    flight_date: c.flight_date,
    destination: c.destination,
    booked_skids: bookedSkids,
    booked_kg: bookedKg,
    status: newStatus
  });

  return { ok: true };
}

async function hasUpliftColumn(columnName) {
  if (upliftColumnCache.has(columnName)) return upliftColumnCache.get(columnName);
  const rows = await query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'uplift_notifications' AND COLUMN_NAME = ?`,
    [columnName]
  );
  const exists = Number(rows[0]?.count || 0) > 0;
  upliftColumnCache.set(columnName, exists);
  return exists;
}

async function hasUpliftIsReadColumn() {
  if (upliftHasReadColumn !== null) return upliftHasReadColumn;
  upliftHasReadColumn = await hasUpliftColumn("is_read");
  return upliftHasReadColumn;
}

async function hasUpliftUpdatedAtColumn() {
  if (upliftHasUpdatedAtColumn !== null) return upliftHasUpdatedAtColumn;
  upliftHasUpdatedAtColumn = await hasUpliftColumn("updated_at");
  return upliftHasUpdatedAtColumn;
}

async function createBooking(req, res, next) {
  try {
    const {
      capacity_id,
      airline_id,
      flight_date,
      destination,
      skids,
      tonnage_kg,
      commodity,
      bsa_type,
      transit_airport
    } = req.body;
    const exporterId = req.user.linked_exporter_id;

    const exporterUsers = await query(
      `SELECT id, full_name, email FROM users WHERE linked_exporter_id = ? AND role = 'exporter'`,
      [exporterId]
    );
    const exporterName = exporterUsers[0]?.full_name || req.user.full_name || "Exporter";

    let capRows = [];

    if (capacity_id) {
      capRows = await query(
        `SELECT id, airline_id, flight_date, destination, total_skids, total_kg, booked_skids, booked_kg
         FROM capacities WHERE id = ? LIMIT 1`,
        [capacity_id]
      );
    }

    if (!capRows.length) {
      capRows = await query(
        `SELECT id, airline_id, flight_date, destination, total_skids, total_kg, booked_skids, booked_kg
         FROM capacities
         WHERE airline_id = ? AND DATE(flight_date) = DATE(?) AND UPPER(TRIM(destination)) = UPPER(TRIM(?))
         ORDER BY id DESC
         LIMIT 1`,
        [airline_id, flight_date, destination]
      );
    }

    const cap = capRows[0] || null;
    const resolvedAirlineId = Number(cap?.airline_id || airline_id);
    const resolvedFlightDate = String(cap?.flight_date || flight_date).slice(0, 10);
    const resolvedDestination = String(cap?.destination || destination || '').trim().toUpperCase();

    const requestedSkids = Number(skids || 0);
    const requestedKg = Number(tonnage_kg || 0);

    let result;
    try {
      const validBsaType = ['BSA', 'Non-BSA'].includes(bsa_type) ? bsa_type : null;
      const transit = String(transit_airport || "").trim().toUpperCase() || null;
      result = await query(
        `INSERT INTO bookings (exporter_id, airline_id, flight_date, destination, transit_airport, skids, tonnage_kg, commodity, bsa_type, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [exporterId, resolvedAirlineId, resolvedFlightDate, resolvedDestination, transit, skids, tonnage_kg, commodity, validBsaType]
      );
    } catch (insertError) {
      throw insertError;
    }

    await notifyAnalystsAndAdminsForAirline(
      resolvedAirlineId,
      "New booking request",
      `Booking #${result.insertId} from ${exporterName} — ${resolvedDestination} on ${resolvedFlightDate} (${requestedSkids} skids, ${requestedKg} kg). Pending review.`,
      "info"
    );

    if (exporterUsers.length && process.env.BREVO_API_KEY) {
      const sender = getBrevoSender();
      const airlineRows = await query(`SELECT name FROM airlines WHERE id = ? LIMIT 1`, [resolvedAirlineId]);
      const airlineName = airlineRows[0]?.name || "selected airline";
      const template = bookingReceivedEmail({
        name: exporterName,
        bookingId: result.insertId,
        airlineName,
        flightDate: resolvedFlightDate,
        destination: resolvedDestination,
        skids,
        kg: Number(tonnage_kg || 0).toLocaleString('en-US'),
        commodity
      });

      await sendBrevoEmail({
        sender,
        to: exporterUsers.map((user) => ({ email: user.email, name: user.full_name || exporterName })),
        subject: `Booking received for ${resolvedDestination} on ${resolvedFlightDate}`,
        textContent: `Hello ${exporterName},\n\nYour cargo booking has been received successfully.\n\nBooking details:\n• Booking ID: #${result.insertId}\n• Airline: ${airlineName}\n• Flight date: ${resolvedFlightDate}\n• Destination: ${resolvedDestination}\n• Skids: ${skids}\n• Tonnage (kg): ${tonnage_kg}\n• Commodity: ${commodity}\n\nStatus: Pending airline review.\n\nYou can check the dashboard for updates.\n\nRegards,\nSBU Cargo Hub`,
        htmlContent: template.htmlContent
      });
    }

    return res.status(201).json({ id: result.insertId, status: "pending" });
  } catch (error) {
    return next(error);
  }
}

async function getMyBookings(req, res, next) {
  try {
    const rows = await query(
      `SELECT b.*, a.name AS airline
       FROM bookings b JOIN airlines a ON b.airline_id = a.id
       WHERE b.exporter_id = ? ORDER BY b.flight_date DESC, b.created_at DESC`,
      [req.user.linked_exporter_id]
    );
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
}

async function getBookingsForAirline(req, res, next) {
  try {
    let sql = `
      SELECT b.id, e.name AS exporter, a.name AS airline, b.flight_date, b.destination,
             b.skids, b.tonnage_kg, b.commodity, b.status, b.pending_reason,
             un.actual_kg,
             'full' AS uplift_type,
             un.awb_number,
             NULL AS uplift_reason,
             NULL AS uplift_message,
             un.created_at AS uplift_updated_at
      FROM bookings b
      JOIN exporters e ON b.exporter_id = e.id
      JOIN airlines a ON b.airline_id = a.id
      LEFT JOIN (
        SELECT u1.booking_id,
               u1.actual_kg,
               u1.awb_number,
               u1.created_at
        FROM uplift_notifications u1
        JOIN (
          SELECT booking_id, MAX(id) AS max_id
          FROM uplift_notifications
          GROUP BY booking_id
        ) latest ON latest.max_id = u1.id
      ) un ON un.booking_id = b.id
      WHERE 1=1`;
    const params = [];

    if (req.user.linked_airline) {
      sql += " AND a.name = ?";
      params.push(req.user.linked_airline);
    }

    sql += " ORDER BY b.flight_date ASC, e.name ASC";
    const rows = await query(sql, params);
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
}

async function getBookingsGroupedByExporter(req, res, next) {
  try {
    const { airline } = req.params;
    if (!airline) {
      return res.status(400).json({ message: "Airline name required" });
    }

    const rows = await query(
      `SELECT b.id, b.exporter_id, e.name AS exporter, a.name AS airline, 
              b.flight_date, b.destination, b.skids, b.tonnage_kg, b.commodity, 
              b.bsa_type, b.status, b.pending_reason, b.created_at, b.updated_at
       FROM bookings b
       JOIN exporters e ON b.exporter_id = e.id
       JOIN airlines a ON b.airline_id = a.id
       WHERE a.name = ?
       ORDER BY e.name ASC, b.flight_date DESC`,
      [airline]
    );

    // Group by exporter
    const grouped = {};
    for (const booking of rows) {
      if (!grouped[booking.exporter]) {
        grouped[booking.exporter] = [];
      }
      grouped[booking.exporter].push(booking);
    }

    return res.json(grouped);
  } catch (error) {
    return next(error);
  }
}

async function reviewBooking(req, res, next) {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Status must be approved or rejected" });
    }

    const rows = await query(`SELECT * FROM bookings WHERE id = ? LIMIT 1`, [id]);
    if (!rows.length) return res.status(404).json({ message: "Booking not found" });

    const booking = rows[0];
    if (String(booking.status) === String(status)) {
      return res.json({ message: `Booking already ${status}` });
    }

    if (status === "approved" && String(booking.status) !== "approved") {
      const reserveResult = await adjustCapacityReservation(
        {
          airline_id: booking.airline_id,
          flight_date: booking.flight_date,
          destination: booking.destination,
          skids: booking.skids,
          tonnage_kg: booking.tonnage_kg
        },
        "reserve"
      );

      if (!reserveResult.ok && reserveResult.reason !== "no-capacity") {
        return res.status(400).json({ message: "Unable to reserve capacity while approving booking" });
      }
    }

    if (status === "rejected" && String(booking.status) === "approved") {
      const releaseResult = await adjustCapacityReservation(
        {
          airline_id: booking.airline_id,
          flight_date: booking.flight_date,
          destination: booking.destination,
          skids: booking.skids,
          tonnage_kg: booking.tonnage_kg
        },
        "release"
      );

      if (!releaseResult.ok) {
        return res.status(400).json({ message: "Unable to release capacity for rejected booking" });
      }
    }

    await query(`UPDATE bookings SET status = ?, pending_reason = ?, updated_at = NOW() WHERE id = ?`, [status, reason || null, id]);

    const exporterUsers = await query(`SELECT id FROM users WHERE linked_exporter_id = ? AND role = 'exporter'`, [booking.exporter_id]);
    for (const user of exporterUsers) {
      await pushNotification(user.id, "Booking review update", `Booking #${id} has been ${status}`, status === "approved" ? "success" : "warning");
    }

    return res.json({ message: `Booking ${status}` });
  } catch (error) {
    return next(error);
  }
}

async function cancelBookingByExporter(req, res, next) {
  try {
    const { id } = req.params;
    const rows = await query(
      `SELECT id, exporter_id, airline_id, flight_date, destination, skids, tonnage_kg, status
       FROM bookings WHERE id = ? AND exporter_id = ? LIMIT 1`,
      [id, req.user.linked_exporter_id]
    );

    if (!rows.length) return res.status(404).json({ message: "Booking not found" });

    const booking = rows[0];
    if (!["pending", "approved"].includes(String(booking.status))) {
      return res.status(400).json({ message: "Only pending or approved bookings can be cancelled" });
    }

    // For approved bookings, enforce the 24h cancellation rule
    // For pending bookings, allow cancellation anytime (not yet confirmed by airline)
    if (String(booking.status) === "approved") {
      const departureAt = new Date(`${String(booking.flight_date).slice(0, 10)}T23:59:59`);
      const hoursUntilDeparture = (departureAt.getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursUntilDeparture < 24) {
        return res.status(400).json({ message: "Approved bookings can only be cancelled more than 24 hours before flight" });
      }
    }

    await query(`UPDATE bookings SET status = 'cancelled', updated_at = NOW() WHERE id = ?`, [id]);

    if (String(booking.status) === "approved") {
      const releaseResult = await adjustCapacityReservation(
        {
          airline_id: booking.airline_id,
          flight_date: booking.flight_date,
          destination: booking.destination,
          skids: booking.skids,
          tonnage_kg: booking.tonnage_kg
        },
        "release"
      );

      if (!releaseResult.ok) {
        return res.status(400).json({ message: "Unable to release capacity for cancelled booking" });
      }
    }

    const exporterUsers = await query(`SELECT id FROM users WHERE linked_exporter_id = ? AND role = 'exporter'`, [booking.exporter_id]);
    for (const user of exporterUsers) {
      await pushNotification(
        user.id,
        "Booking cancelled",
        `Booking #${booking.id} was cancelled by exporter (more than 24h before flight).`,
        "warning"
      );
    }

    if (process.env.BREVO_API_KEY) {
      const sender = getBrevoSender();
      const recipients = await query(
        `SELECT full_name, email FROM users WHERE linked_exporter_id = ? AND role = 'exporter' AND email IS NOT NULL`,
        [booking.exporter_id]
      );

      for (const recipient of recipients) {
        const template = bookingCancelledEmail({
          name: recipient.full_name || "Exporter",
          bookingId: booking.id,
          flightDate: String(booking.flight_date).slice(0, 10),
          destination: booking.destination
        });

        await sendBrevoEmail({
          sender,
          to: [{ email: recipient.email, name: recipient.full_name || "Exporter" }],
          subject: `Booking #${booking.id} cancelled successfully`,
          textContent: `Hello ${recipient.full_name || "Exporter"},\n\nYour booking #${booking.id} (${booking.destination} on ${String(booking.flight_date).slice(0, 10)}) was cancelled successfully.\n\nIf this was not expected, contact support immediately.\n\nRegards,\nSBU Cargo Hub`,
          htmlContent: template.htmlContent
        });
      }
    }

    return res.json({ message: "Booking cancelled successfully" });
  } catch (error) {
    return next(error);
  }
}

async function confirmUpliftByExporter(req, res, next) {
  try {
    const { id } = req.params;
    const rows = await query(`SELECT id, exporter_id, flight_date FROM bookings WHERE id = ? AND exporter_id = ? LIMIT 1`, [
      id,
      req.user.linked_exporter_id
    ]);

    if (!rows.length) return res.status(404).json({ message: "Booking not found" });

    const booking = rows[0];
    await query(
      `INSERT INTO daily_confirmations (booking_id, confirm_date, status, confirmed_at)
       VALUES (?, ?, 'confirmed', NOW())
       ON DUPLICATE KEY UPDATE status = 'confirmed', confirmed_at = NOW()`,
      [booking.id, booking.flight_date]
    );

    return res.json({ message: "Uplift confirmed" });
  } catch (error) {
    return next(error);
  }
}

async function addUpliftNotification(req, res, next) {
  try {
    const { id } = req.params;
    const { actual_kg, awb_number, reason, uplift_type, explanation } = req.body;

    const bookings = await query(`SELECT id, exporter_id, skids FROM bookings WHERE id = ? LIMIT 1`, [id]);
    if (!bookings.length) return res.status(404).json({ message: "Booking not found" });

    const { awb_type, message, kg_confirmation } = req.body;
    let document_path = null;
    
    if (req.file) {
      const uploadDir = require('path').join(process.cwd(), 'uploads');
      const fileName = `${Date.now()}-${req.file.originalname.replace(/\s+/g, '_')}`;
      document_path = `uplift-docs/${fileName}`;
    }
    
   
     await query(
      `INSERT INTO uplift_notifications (booking_id, airline_analyst_id, actual_kg, awb_number, awb_type, uplift_type, explanation, message, kg_confirmation, document_upload_path, reason, skids)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        req.user.id,
        actual_kg,
        awb_number,
        awb_type || null,
        uplift_type || "full",
        explanation || null,
        message || null,
        kg_confirmation || null,
        document_path,
        reason || null,
        Number(bookings[0].skids || 0)
      ]
     );
    
    const users = await query(`SELECT id, full_name, email, role FROM users WHERE linked_exporter_id = ? AND role IN ('exporter', 'clearing_agent')`, [
      bookings[0].exporter_id
    ]);

    for (const u of users) {
      const message = `Booking #${id} updated with actual kg ${actual_kg}${reason ? `. Reason: ${reason}` : ""}. AWB: ${awb_number}.`;
      await pushNotification(u.id, "Uplift/Offload notification", message, "info");

      if (process.env.BREVO_API_KEY && u.email) {
        await sendBrevoEmail({
          sender: getBrevoSender(),
          to: [{ email: u.email, name: u.full_name || u.role }],
          subject: `Uplift update for booking #${id}`,
          textContent: `Hello ${u.full_name || "team member"},\n\n${message}\n\nPlease review the dashboard for more details.\n\nRegards,\nSBU Cargo Hub`
        });
      }
    }

    return res.status(201).json({ message: "Uplift notification sent" });
  } catch (error) {
    return next(error);
  }
}

async function addUpliftConfirmation(req, res, next) {
  try {
    const { id } = req.params;
    const { actual_kg } = req.body;

    const confirmerRole = req.user.role;
    if (!["airline_analyst", "airline_supervisor", "clearing_agent"].includes(confirmerRole)) {
      return res.status(403).json({ message: "Only airline analyst, airline supervisor, and clearing agent can confirm uplift kg" });
    }

    const bookings = await query(`SELECT id FROM bookings WHERE id = ? LIMIT 1`, [id]);
    if (!bookings.length) return res.status(404).json({ message: "Booking not found" });

    await query(
      `INSERT INTO uplift_confirmations (booking_id, confirmer_role, confirmer_user_id, actual_kg)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE actual_kg = VALUES(actual_kg), confirmed_at = NOW()`,
      [id, confirmerRole, req.user.id, actual_kg]
    );
    
    // Auto-generate the invoice as soon as airline supervisor + clearing agent confirm matching kg
    // (allow a small 1 kg rounding tolerance, since uplift kg is captured manually).
    const confirmations = await query(
      `SELECT confirmer_role, actual_kg FROM uplift_confirmations WHERE booking_id = ?`,
      [id]
    );
    const roleMap = new Map(confirmations.map((row) => [String(row.confirmer_role), Number(row.actual_kg)]));
    const supervisorKg = roleMap.get("airline_supervisor");
    const clearingKg = roleMap.get("clearing_agent");
    const hasFinalPair = Number.isFinite(supervisorKg) && Number.isFinite(clearingKg);
    const kgsMatch = hasFinalPair && Math.abs(supervisorKg - clearingKg) <= 1;

    let invoiceCreated = false;
    if (kgsMatch) {
      const booking = await query(
        `SELECT b.id, b.exporter_id, b.commodity, b.tonnage_kg, b.flight_date, b.destination, a.name as airline
         FROM bookings b
         JOIN airlines a ON b.airline_id = a.id
         WHERE b.id = ?
         LIMIT 1`,
        [id]
      );

      if (booking.length) {
        const b = booking[0];
        const existingLine = await query(`SELECT id, invoice_id FROM invoice_lines WHERE booking_id = ? LIMIT 1`, [id]);
        if (!existingLine.length) {
          const awbRows = await query(
            `SELECT awb_number FROM uplift_notifications WHERE booking_id = ? AND awb_number IS NOT NULL AND awb_number <> '' ORDER BY id DESC`,
            [id]
          );
          const awbList = awbRows.map((r) => String(r.awb_number)).filter(Boolean);
          const awbSummary = awbList.length ? awbList.slice(0, 3).join(", ") + (awbList.length > 3 ? ", …" : "") : "";

          const invoiceNumber = `INV-${Date.now()}`;
          const unitPrice = await getExporterPriceForBilling(b.exporter_id);
          const billingKg = Number(supervisorKg);
          const totalAmount = +(billingKg * unitPrice).toFixed(2);
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 30);

          const invoiceRes = await query(
            `INSERT INTO invoices (invoice_number, exporter_id, start_date, end_date, total_amount, due_date, status)
             VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
            [invoiceNumber, b.exporter_id, String(b.flight_date).slice(0, 10), String(b.flight_date).slice(0, 10), totalAmount, dueDate.toISOString().slice(0, 10)]
          );

          if (invoiceRes.insertId) {
            const description = `${b.commodity} via ${b.airline} - Booking #${id} (${b.destination})${awbSummary ? ` — AWB: ${awbSummary}` : ""}`;
            await query(
              `INSERT INTO invoice_lines (invoice_id, booking_id, description, quantity_kg, unit_price, total_price)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [invoiceRes.insertId, id, description, billingKg, unitPrice, totalAmount]
            );

            invoiceCreated = true;

            // Notify exporter that the invoice has been auto-issued.
            const exporterUsers = await query(
              `SELECT id, full_name, email FROM users WHERE linked_exporter_id = ? AND role = 'exporter'`,
              [b.exporter_id]
            );
            for (const u of exporterUsers) {
              await pushNotification(
                u.id,
                "Invoice issued",
                `Invoice ${invoiceNumber} for booking #${id} has been generated automatically (${billingKg.toLocaleString("en-US")} kg @ $${unitPrice}/kg = $${totalAmount.toFixed(2)}).`,
                "info"
              );
            }
          }
        }
      }
    }

    return res.status(201).json({
      message: invoiceCreated ? "Uplift kg confirmed — invoice auto-generated" : "Uplift kg confirmed",
      kgs_match: kgsMatch,
      invoice_created: invoiceCreated
    });
  } catch (error) {
    return next(error);
  }
}

async function confirmBookingByAnalyst(req, res, next) {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const bookings = await query(
      `SELECT b.id, b.exporter_id, b.status, b.airline_id, b.flight_date, b.destination, b.skids, b.tonnage_kg FROM bookings b WHERE b.id = ? LIMIT 1`,
      [id]
    );

    if (!bookings.length) return res.status(404).json({ message: "Booking not found" });

    const booking = bookings[0];

    if (String(booking.status) !== 'approved') {
      const reserveResult = await adjustCapacityReservation(
        {
          airline_id: booking.airline_id,
          flight_date: booking.flight_date,
          destination: booking.destination,
          skids: booking.skids,
          tonnage_kg: booking.tonnage_kg
        },
        "reserve"
      );

      if (!reserveResult.ok) {
        return res.status(400).json({ message: "Unable to reserve capacity for booking approval" });
      }
    }

    await query(
      `UPDATE bookings SET status = ?, pending_reason = ?, updated_at = NOW() WHERE id = ?`,
      ['approved', notes || null, id]
    );

    const exporterUsers = await query(
      `SELECT id, email, full_name FROM users WHERE linked_exporter_id = ? AND role = 'exporter'`,
      [booking.exporter_id]
    );

    for (const user of exporterUsers) {
      await pushNotification(user.id, "Booking Confirmed", `Booking #${id} confirmed by airline${notes ? `. Note: ${notes}` : ""}`, "success");
    }

    return res.json({ message: "Booking confirmed" });
  } catch (error) {
    return next(error);
  }
}

async function addAdditionalRequest(req, res, next) {
  try {
    const { id } = req.params;
    const { request_details } = req.body;

    if (!request_details) {
      return res.status(400).json({ message: "Request details required" });
    }

    const bookings = await query(
      `SELECT b.id, b.exporter_id, b.pending_reason FROM bookings b WHERE b.id = ? LIMIT 1`,
      [id]
    );

    if (!bookings.length) return res.status(404).json({ message: "Booking not found" });

    const booking = bookings[0];
    const existingReason = booking.pending_reason || "";
    const updatedReason = existingReason 
      ? `${existingReason} | Additional: ${request_details}` 
      : `Additional request: ${request_details}`;

    await query(
      `UPDATE bookings SET pending_reason = ?, updated_at = NOW() WHERE id = ?`,
      [updatedReason, id]
    );

    const exporterUsers = await query(
      `SELECT id, email, full_name FROM users WHERE linked_exporter_id = ? AND role = 'exporter'`,
      [booking.exporter_id]
    );

    for (const user of exporterUsers) {
      await pushNotification(user.id, "Additional Request", `Booking #${id} has additional request: ${request_details}`, "info");
    }

    return res.json({ message: "Additional request added" });
  } catch (error) {
    return next(error);
  }
}

async function rescheduleRequest(req, res, next) {
  try {
    const { id } = req.params;
    const { new_date, reason } = req.body;

    if (!new_date) {
      return res.status(400).json({ message: "New date required for reschedule" });
    }

    const bookings = await query(
      `SELECT b.id, b.exporter_id, b.flight_date FROM bookings b WHERE b.id = ? LIMIT 1`,
      [id]
    );

    if (!bookings.length) return res.status(404).json({ message: "Booking not found" });

    const booking = bookings[0];
    const rescheduleMsg = `Reschedule requested: from ${booking.flight_date} to ${new_date}${reason ? ` (${reason})` : ""}`;
    const updatedReason = booking.pending_reason 
      ? `${booking.pending_reason} | ${rescheduleMsg}` 
      : rescheduleMsg;

    await query(
      `UPDATE bookings SET pending_reason = ?, updated_at = NOW() WHERE id = ?`,
      [updatedReason, id]
    );

    const exporterUsers = await query(
      `SELECT id, email, full_name FROM users WHERE linked_exporter_id = ? AND role = 'exporter'`,
      [booking.exporter_id]
    );

    const oldDate = String(booking.flight_date || "").slice(0, 10);
    const newDate = String(new_date || "").slice(0, 10);
    const notifTitle = `Booking #${id} rescheduled`;
    const notifMessage = `Original date: ${oldDate} → New date: ${newDate}.${reason ? ` Reason: ${reason}.` : ""} Please review this update in your Booking History.`;

    for (const user of exporterUsers) {
      await pushNotification(user.id, notifTitle, notifMessage, "warning");
    }

    return res.json({ message: "Reschedule request added", original_date: oldDate, new_date: newDate });
  } catch (error) {
    return next(error);
  }
}

async function editBookingCapacity(req, res, next) {
  try {
    const { id } = req.params;
    const { tonnage_kg, skids } = req.body;

    const bookingRows = await query(
      `SELECT b.id, b.status, b.airline_id, b.flight_date, b.destination, b.tonnage_kg AS old_tonnage, b.skids AS old_skids, b.exporter_id
       FROM bookings b
       WHERE b.id = ? LIMIT 1`,
      [id]
    );

    if (!bookingRows.length) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const booking = bookingRows[0];

    if (!["pending", "approved"].includes(String(booking.status))) {
      return res.status(400).json({ message: "Can only edit pending or approved bookings" });
    }

    const oldTonnage = Number(booking.old_tonnage);
    const oldSkids = Number(booking.old_skids);
    const oldKgPerSkid = oldSkids > 0 ? oldTonnage / oldSkids : 0;

    let newTonnage = tonnage_kg ? Number(tonnage_kg) : Number(booking.old_tonnage);
    let newSkids = skids ? Number(skids) : Number(booking.old_skids);

    // Keep kg and skids hand-in-hand when only one side is changed.
    if (tonnage_kg && !skids && oldKgPerSkid > 0) {
      newSkids = Number((newTonnage / oldKgPerSkid).toFixed(2));
    }
    if (skids && !tonnage_kg && oldKgPerSkid > 0) {
      newTonnage = Number((newSkids * oldKgPerSkid).toFixed(2));
    }

    // If values changed on an approved booking, adjust reserved capacity.
    if (booking.status === "approved" && (newTonnage !== oldTonnage || newSkids !== oldSkids)) {
      // Release old reservation
      const releaseResult = await adjustCapacityReservation(
        {
          airline_id: booking.airline_id,
          flight_date: booking.flight_date,
          destination: booking.destination,
          skids: oldSkids,
          tonnage_kg: oldTonnage
        },
        "release"
      );

      if (!releaseResult.ok && releaseResult.reason !== "no-capacity") {
        return res.status(400).json({ message: "Unable to release old capacity reservation" });
      }

      let reserveResult = { ok: true };
      if (releaseResult.ok) {
        // Reserve new capacity
        reserveResult = await adjustCapacityReservation(
          {
            airline_id: booking.airline_id,
            flight_date: booking.flight_date,
            destination: booking.destination,
            skids: newSkids,
            tonnage_kg: newTonnage
          },
          "reserve"
        );
      }

      if (!reserveResult.ok) {
        // Revert by re-reserving old capacity
        await adjustCapacityReservation(
          {
            airline_id: booking.airline_id,
            flight_date: booking.flight_date,
            destination: booking.destination,
            skids: oldSkids,
            tonnage_kg: oldTonnage
          },
          "reserve"
        );
        return res.status(400).json({ message: "Requested capacity exceeds available" });
      }
    }

    await query(
      `UPDATE bookings SET tonnage_kg = ?, skids = ?, updated_at = NOW() WHERE id = ?`,
      [newTonnage, newSkids, id]
    );

    return res.json({ message: "Booking capacity updated", tonnage_kg: newTonnage, skids: newSkids });
  } catch (error) {
    return next(error);
  }
}

async function getUpliftNotifications(req, res, next) {
  try {
    const exporterId = req.user.linked_exporter_id;
    
    if (!exporterId) {
      return res.json([]);
    }

    // Check if uplift_notifications table exists
    const tableExists = await query(
      `SELECT COUNT(*) AS count
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'uplift_notifications'`
    );

    if (!tableExists.length || Number(tableExists[0].count) === 0) {
      return res.json([]);
    }

    const includeIsRead = await hasUpliftIsReadColumn();
    const includeUpdatedAt = await hasUpliftUpdatedAtColumn();
    const includeFlightNumber = await hasUpliftColumn("flight_number");
    const includeAwbType = await hasUpliftColumn("awb_type");
    const includeExplanation = await hasUpliftColumn("explanation");
    const includeKgConfirmation = await hasUpliftColumn("kg_confirmation");
    const includeOnwardDestination = await hasUpliftColumn("onward_destination");
    const includeOnwardFlight = await hasUpliftColumn("onward_flight");
    const includeMessage = await hasUpliftColumn("message");
    const includeReason = await hasUpliftColumn("reason");
    const includeUpliftType = await hasUpliftColumn("uplift_type");
    
    const notifications = await query(
      `SELECT un.id, un.booking_id, b.airline_id,
              ${includeFlightNumber ? "un.flight_number" : "NULL"} AS flight_number,
              un.awb_number,
              ${includeAwbType ? "un.awb_type" : "NULL"} AS awb_type,
              ${includeMessage ? "un.message" : "NULL"} AS message,
              ${includeExplanation ? "un.explanation" : "NULL"} AS explanation,
              ${includeReason ? "un.reason" : "NULL"} AS reason,
              ${includeKgConfirmation ? "un.kg_confirmation" : "NULL"} AS kg_confirmation,
              un.actual_kg AS tonnage_kg, un.created_at, ${includeUpdatedAt ? "un.updated_at" : "un.created_at"} AS updated_at, ${includeUpliftType ? "un.uplift_type" : "'received'"} AS status,
              a.name AS airline, b.destination, b.skids,
              ${includeOnwardDestination ? "un.onward_destination" : "NULL"} AS onward_destination,
              ${includeOnwardFlight ? "un.onward_flight" : "NULL"} AS onward_flight,
              ${includeIsRead ? "COALESCE(un.is_read, 0)" : "0"} AS is_read
       FROM uplift_notifications un
       JOIN bookings b ON un.booking_id = b.id
       JOIN airlines a ON b.airline_id = a.id
       WHERE b.exporter_id = ?
       ORDER BY ${includeUpdatedAt ? "un.updated_at DESC," : ""} un.created_at DESC`,
      [exporterId]
    );

    return res.json(notifications || []);
  } catch (error) {
    console.error('Error in getUpliftNotifications:', error);
    return res.json([]);
  }
}

async function markUpliftNotificationRead(req, res, next) {
  try {
    const { id } = req.params;
    const exporterId = req.user.linked_exporter_id;
    const includeIsRead = await hasUpliftIsReadColumn();
    if (!includeIsRead) return res.json({ message: "Marked as read" });
    await query(
      `UPDATE uplift_notifications un
       JOIN bookings b ON un.booking_id = b.id
       SET un.is_read = 1
       WHERE un.id = ? AND b.exporter_id = ?`,
      [id, exporterId]
    );
    return res.json({ message: "Marked as read" });
  } catch (error) {
    return next(error);
  }
}

async function deleteUpliftNotification(req, res, next) {
  try {
    const { id } = req.params;
    const exporterId = req.user.linked_exporter_id;
    await query(
      `DELETE un
       FROM uplift_notifications un
       JOIN bookings b ON un.booking_id = b.id
       WHERE un.id = ? AND b.exporter_id = ?`,
      [id, exporterId]
    );
    return res.json({ message: "Notification deleted" });
  } catch (error) {
    return next(error);
  }
}

function parsePendingIncreaseTag(pendingReason) {
  const text = String(pendingReason || "");
  const match = text.match(/PENDING_INC:([\d.]+):([\d.]+)/);
  if (!match) return null;
  return { skids: Number(match[1]), tonnage_kg: Number(match[2]) };
}

function stripPendingIncreaseTag(pendingReason) {
  return String(pendingReason || "")
    .replace(/\s*\|\s*PENDING_INC:[\d.]+:[\d.]+/g, "")
    .replace(/^PENDING_INC:[\d.]+:[\d.]+(\s*\|\s*)?/i, "")
    .trim() || null;
}

async function adjustExporterApprovedAllocation(req, res, next) {
  try {
    const { id } = req.params;
    const { skids, tonnage_kg } = req.body;
    const newSkids = Number(skids);
    const newKg = Number(tonnage_kg);
    if (!Number.isFinite(newSkids) || !Number.isFinite(newKg) || newSkids < 1 || newKg <= 0) {
      return res.status(400).json({ message: "Valid skids and tonnage (kg) are required" });
    }

    const rows = await query(
      `SELECT b.id, b.exporter_id, b.airline_id, b.flight_date, b.destination, b.skids, b.tonnage_kg, b.status, b.pending_reason
       FROM bookings b WHERE b.id = ? AND b.exporter_id = ? LIMIT 1`,
      [id, req.user.linked_exporter_id]
    );
    if (!rows.length) return res.status(404).json({ message: "Booking not found" });
    const booking = rows[0];
    if (String(booking.status) !== "approved") {
      return res.status(400).json({ message: "Only approved bookings can be adjusted here" });
    }

    const flightDay = String(booking.flight_date).slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const oldSkids = Number(booking.skids);
    const oldKg = Number(booking.tonnage_kg);
    if (flightDay < today) {
      return res.status(400).json({ message: "Booking space can only be edited before the flight date" });
    }
    if (oldSkids === newSkids && oldKg === newKg) {
      return res.json({ message: "No change", status: "unchanged" });
    }

    const isIncrease = newSkids > oldSkids || newKg > oldKg;
    const isReduction = newSkids < oldSkids || newKg < oldKg;

    if (isIncrease) {
      const tag = `PENDING_INC:${newSkids}:${Math.round(newKg)}`;
      const existing = stripPendingIncreaseTag(booking.pending_reason);
      const nextReason = existing ? `${existing} | ${tag}` : tag;
      await query(`UPDATE bookings SET pending_reason = ?, updated_at = NOW() WHERE id = ?`, [nextReason.slice(0, 250), id]);

      await notifyAnalystsAndAdminsForAirline(
        booking.airline_id,
        "Additional space request",
        `Exporter requests more capacity for booking #${id}: ${newSkids} skids, ${newKg} kg. Pending analyst approval.`,
        "warning"
      );

      return res.status(202).json({
        message: "Additional space request sent to airline analysts for approval.",
        status: "pending_approval"
      });
    }

    if (!isReduction) {
      return res.json({ message: "No change", status: "unchanged" });
    }

    const releaseResult = await adjustCapacityReservation(
      {
        airline_id: booking.airline_id,
        flight_date: booking.flight_date,
        destination: booking.destination,
        skids: oldSkids,
        tonnage_kg: oldKg
      },
      "release"
    );
    if (!releaseResult.ok && releaseResult.reason !== "no-capacity") {
      return res.status(400).json({ message: "Unable to release existing allocation" });
    }

    if (releaseResult.ok) {
      const reserveResult = await adjustCapacityReservation(
        {
          airline_id: booking.airline_id,
          flight_date: booking.flight_date,
          destination: booking.destination,
          skids: newSkids,
          tonnage_kg: newKg
        },
        "reserve"
      );

      if (!reserveResult.ok) {
        await adjustCapacityReservation(
          {
            airline_id: booking.airline_id,
            flight_date: booking.flight_date,
            destination: booking.destination,
            skids: oldSkids,
            tonnage_kg: oldKg
          },
          "reserve"
        );
        return res.status(400).json({ message: "Unable to apply reduced allocation" });
      }
    }

    await query(`UPDATE bookings SET skids = ?, tonnage_kg = ?, pending_reason = ?, updated_at = NOW() WHERE id = ?`, [
      newSkids,
      newKg,
      stripPendingIncreaseTag(booking.pending_reason),
      id
    ]);

    await notifyAnalystsAndAdminsForAirline(
      booking.airline_id,
      "Reduced confirmed space",
      `Booking #${id}: exporter reduced allocation to ${newSkids} skids / ${newKg} kg. Freed capacity is available for other bookings.`,
      "info"
    );

    return res.json({ message: "Allocation updated", status: "applied" });
  } catch (error) {
    return next(error);
  }
}

async function approvePendingAllocationIncrease(req, res, next) {
  try {
    const { id } = req.params;
    const bookingRows = await query(`SELECT * FROM bookings WHERE id = ? LIMIT 1`, [id]);
    if (!bookingRows.length) return res.status(404).json({ message: "Booking not found" });
    const booking = bookingRows[0];
    const pending = parsePendingIncreaseTag(booking.pending_reason);
    if (!pending) {
      return res.status(400).json({ message: "No pending increase tag on this booking" });
    }

    const releaseResult = await adjustCapacityReservation(
      {
        airline_id: booking.airline_id,
        flight_date: booking.flight_date,
        destination: booking.destination,
        skids: booking.skids,
        tonnage_kg: booking.tonnage_kg
      },
      "release"
    );
    if (!releaseResult.ok) return res.status(400).json({ message: "Unable to release current reservation" });

    const reserveResult = await adjustCapacityReservation(
      {
        airline_id: booking.airline_id,
        flight_date: booking.flight_date,
        destination: booking.destination,
        skids: pending.skids,
        tonnage_kg: pending.tonnage_kg
      },
      "reserve"
    );

    if (!reserveResult.ok) {
      await adjustCapacityReservation(
        {
          airline_id: booking.airline_id,
          flight_date: booking.flight_date,
          destination: booking.destination,
          skids: booking.skids,
          tonnage_kg: booking.tonnage_kg
        },
        "reserve"
      );
      return res.status(400).json({ message: "Still not enough capacity to approve increase" });
    }

    await query(`UPDATE bookings SET skids = ?, tonnage_kg = ?, pending_reason = ?, updated_at = NOW() WHERE id = ?`, [
      pending.skids,
      pending.tonnage_kg,
      stripPendingIncreaseTag(booking.pending_reason),
      id
    ]);

    const exporterUsers = await query(`SELECT id FROM users WHERE linked_exporter_id = ? AND role = 'exporter'`, [
      booking.exporter_id
    ]);
    for (const u of exporterUsers) {
      await pushNotification(
        u.id,
        "Allocation increase approved",
        `Your requested increase for booking #${id} was approved (${pending.skids} skids, ${pending.tonnage_kg} kg).`,
        "success"
      );
    }

    return res.json({ message: "Pending increase approved and applied" });
  } catch (error) {
    return next(error);
  }
}

async function exportGroupedBookingsToExcel(req, res, next) {
  try {
    const { generateBookingsExcel } = require("../utils/excelExport");
    const { airline } = req.params;
    const rows = await query(
      `SELECT b.id, e.name AS exporter, a.name AS airline, b.flight_date, b.destination, b.skids, b.tonnage_kg, b.commodity, b.status, b.created_at, b.updated_at
       FROM bookings b
       JOIN exporters e ON b.exporter_id = e.id
       JOIN airlines a ON b.airline_id = a.id
       WHERE a.name = ?
       ORDER BY e.name ASC, b.flight_date DESC`,
      [airline]
    );

    const workbook = await generateBookingsExcel(rows, `${airline}-Requests`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${airline}-Bookings-${new Date().toISOString().slice(0, 10)}.xlsx"`
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    return next(error);
  }
}

async function exportBookingsToExcel(req, res, next) {
  try {
    const { generateBookingsExcel } = require("../utils/excelExport");
    const exporterId = req.user.linked_exporter_id;

    const { startDate, endDate, statuses } = req.query;
    const params = [exporterId];
    let sql = `SELECT b.id, a.name AS airline, b.flight_date, b.destination, b.transit_airport,
                      b.skids, b.tonnage_kg, b.commodity, b.bsa_type, b.status, b.created_at, b.updated_at
               FROM bookings b
               JOIN airlines a ON b.airline_id = a.id
               WHERE b.exporter_id = ?`;

    if (startDate && /^\d{4}-\d{2}-\d{2}$/.test(String(startDate))) {
      sql += " AND b.flight_date >= ?";
      params.push(startDate);
    }
    if (endDate && /^\d{4}-\d{2}-\d{2}$/.test(String(endDate))) {
      sql += " AND b.flight_date <= ?";
      params.push(endDate);
    }

    const allowedStatuses = ["pending", "approved", "cancelled", "rejected"];
    const requestedStatuses = String(statuses || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => allowedStatuses.includes(s));
    if (requestedStatuses.length) {
      sql += ` AND b.status IN (${requestedStatuses.map(() => "?").join(",")})`;
      params.push(...requestedStatuses);
    }

    sql += " ORDER BY b.flight_date DESC, b.created_at DESC";

    const bookings = await query(sql, params);

    const exporter = await query(`SELECT name FROM exporters WHERE id = ? LIMIT 1`, [exporterId]);
    const exporterName = exporter[0]?.name || "Exporter";

    const workbook = await generateBookingsExcel(bookings, exporterName);

    const datePart = [startDate || "all", endDate || "all"].join("_to_");
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${exporterName}-Bookings-${datePart}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    return next(error);
  }
}

async function exportCapacityToExcel(req, res, next) {
  try {
    const { generateCapacityExcel } = require("../utils/excelExport");
    const { startDate, endDate } = req.query;

    let sql = `
      SELECT c.id, a.name AS airline, c.flight_date, c.destination, c.total_skids, c.booked_skids, c.total_kg, c.booked_kg, c.status, c.pmc_details
      FROM capacities c
      JOIN airlines a ON c.airline_id = a.id
      WHERE 1=1`;
    const params = [];

    if (startDate) {
      sql += " AND c.flight_date >= ?";
      params.push(startDate);
    }
    if (endDate) {
      sql += " AND c.flight_date <= ?";
      params.push(endDate);
    }

    sql += " ORDER BY c.flight_date ASC, a.name ASC";
    const capacities = await query(sql, params);

    const workbook = await generateCapacityExcel(capacities);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Space-Availability-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    return next(error);
  }
}

async function editPendingBooking(req, res, next) {
  try {
    const { id } = req.params;
    const { flight_date, skids, tonnage_kg } = req.body;
    
    const rows = await query(
      `SELECT id, exporter_id, status, flight_date, skids, tonnage_kg, airline_id, destination
       FROM bookings WHERE id = ? AND exporter_id = ? LIMIT 1`,
      [id, req.user.linked_exporter_id]
    );

    if (!rows.length) return res.status(404).json({ message: "Booking not found" });
    
    const booking = rows[0];
    if (String(booking.status) !== "pending") {
      return res.status(400).json({ message: "Only pending bookings can be edited" });
    }

    // Update the booking with new values
    await query(
      `UPDATE bookings SET flight_date = ?, skids = ?, tonnage_kg = ?, updated_at = NOW() WHERE id = ?`,
      [flight_date, skids, tonnage_kg, id]
    );

    return res.json({ 
      message: "Booking updated successfully",
      id,
      flight_date,
      skids,
      tonnage_kg
    });
  } catch (error) {
    return next(error);
  }
}

async function getBookingsForExporterClearing(req, res, next) {
  try {
    const exporterId = Number(req.params.exporterId);
    if (!Number.isFinite(exporterId) || exporterId < 1) {
      return res.status(400).json({ message: "Invalid exporter id" });
    }

    if (req.user.role === "clearing_agent" && req.user.linked_exporter_id) {
      if (Number(req.user.linked_exporter_id) !== exporterId) {
        return res.status(403).json({ message: "Forbidden" });
      }
    }

    const rows = await query(
      `SELECT b.id, b.exporter_id, b.destination, b.flight_date, b.tonnage_kg, b.status, b.commodity,
              a.name AS airline_name
       FROM bookings b
       LEFT JOIN airlines a ON b.airline_id = a.id
       WHERE b.exporter_id = ?
       ORDER BY
         CASE LOWER(b.status)
           WHEN 'approved' THEN 1
           WHEN 'pending' THEN 2
           ELSE 3
         END,
         b.flight_date DESC,
         b.created_at DESC
       LIMIT 250`,
      [exporterId]
    );

    return res.json(rows);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createBooking,
  getMyBookings,
  getBookingsForAirline,
  getBookingsGroupedByExporter,
  getBookingsForExporterClearing,
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
  exportCapacityToExcel
};
