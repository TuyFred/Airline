const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const { query } = require("../config/db");
const { processWeeklyInvoices } = require("../services/scheduler");
const { buildInvoicePdf } = require("../utils/invoicePdf");

async function listExporterPricing(req, res, next) {
  try {
    const rows = await query(
      `SELECT e.id AS exporter_id, e.name AS exporter_name,
              COALESCE(p.price_per_kg, 5) AS price_per_kg,
              COALESCE(p.pricing_model, 'per_kg') AS pricing_model,
              p.price_per_awb,
              COALESCE(p.currency, 'USD') AS currency,
              p.notes,
              p.updated_at
       FROM exporters e
       LEFT JOIN exporter_pricing p ON p.exporter_id = e.id
       ORDER BY e.name ASC`
    );
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
}

async function upsertExporterPricing(req, res, next) {
  try {
    const { exporter_id, price_per_kg, price_per_awb, pricing_model, currency, notes } = req.body;
    if (!exporter_id) return res.status(400).json({ message: "exporter_id is required" });
    const price = Number(price_per_kg);
    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({ message: "price_per_kg must be a non-negative number" });
    }

    const modelRaw = String(pricing_model || "per_kg").toLowerCase();
    const model = modelRaw === "per_awb" ? "per_awb" : "per_kg";
    let awbPrice = null;
    if (model === "per_awb") {
      const pAwb = Number(price_per_awb);
      if (!Number.isFinite(pAwb) || pAwb < 0) {
        return res.status(400).json({ message: "price_per_awb is required and must be non-negative when pricing_model is per_awb" });
      }
      awbPrice = pAwb;
    } else if (price_per_awb != null && price_per_awb !== "") {
      const pAwb = Number(price_per_awb);
      if (Number.isFinite(pAwb) && pAwb >= 0) awbPrice = pAwb;
    }

    const exporter = await query(`SELECT id FROM exporters WHERE id = ? LIMIT 1`, [exporter_id]);
    if (!exporter.length) return res.status(404).json({ message: "Exporter not found" });

    if (model === "per_kg" && awbPrice == null) {
      const existing = await query(`SELECT price_per_awb FROM exporter_pricing WHERE exporter_id = ? LIMIT 1`, [exporter_id]);
      if (existing.length && existing[0].price_per_awb != null && existing[0].price_per_awb !== "") {
        const legacy = Number(existing[0].price_per_awb);
        if (Number.isFinite(legacy) && legacy >= 0) awbPrice = legacy;
      }
    }

    await query(
      `INSERT INTO exporter_pricing (exporter_id, price_per_kg, pricing_model, price_per_awb, currency, notes, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         price_per_kg = VALUES(price_per_kg),
         pricing_model = VALUES(pricing_model),
         price_per_awb = VALUES(price_per_awb),
         currency = VALUES(currency),
         notes = VALUES(notes),
         updated_by = VALUES(updated_by),
         updated_at = NOW()`,
      [
        Number(exporter_id),
        price,
        model,
        awbPrice,
        String(currency || "USD").toUpperCase().slice(0, 8),
        notes ? String(notes).slice(0, 250) : null,
        req.user?.id || null
      ]
    );

    return res.json({
      message: "Exporter price saved",
      exporter_id: Number(exporter_id),
      price_per_kg: price,
      pricing_model: model,
      price_per_awb: awbPrice
    });
  } catch (error) {
    return next(error);
  }
}

async function downloadWeeklyInvoiceReport(req, res, next) {
  try {
    const { exporter_id, start_date, end_date } = req.query || {};
    const filters = [];
    const params = [];

    if (exporter_id) {
      filters.push("b.exporter_id = ?");
      params.push(Number(exporter_id));
    }
    if (start_date) {
      filters.push("b.flight_date >= ?");
      params.push(start_date);
    }
    if (end_date) {
      filters.push("b.flight_date <= ?");
      params.push(end_date);
    }

    const where = filters.length ? `AND ${filters.join(" AND ")}` : "";

    const rows = await query(
      `SELECT
         b.id AS booking_id,
         b.flight_date,
         b.destination,
         e.id AS exporter_id,
         e.name AS exporter_name,
         a.name AS airline_name,
         un.awb_number,
         COALESCE(
           CASE
             WHEN uc_sup.actual_kg IS NOT NULL AND uc_clr.actual_kg IS NOT NULL
               THEN LEAST(uc_sup.actual_kg, uc_clr.actual_kg)
             ELSE COALESCE(uc_sup.actual_kg, uc_clr.actual_kg)
           END,
           un.actual_kg,
           0
         ) AS uplifted_kg,
         COALESCE(p.price_per_kg, 5) AS price_per_kg,
         COALESCE(p.pricing_model, 'per_kg') AS pricing_model,
         p.price_per_awb
       FROM bookings b
       JOIN exporters e ON b.exporter_id = e.id
       JOIN airlines a ON b.airline_id = a.id
       LEFT JOIN exporter_pricing p ON p.exporter_id = e.id
       LEFT JOIN (
         SELECT u.booking_id, MAX(u.id) AS max_id FROM uplift_notifications u GROUP BY u.booking_id
       ) latest ON latest.booking_id = b.id
       LEFT JOIN uplift_notifications un ON un.id = latest.max_id
       LEFT JOIN uplift_confirmations uc_sup ON uc_sup.booking_id = b.id AND uc_sup.confirmer_role = 'airline_supervisor'
       LEFT JOIN uplift_confirmations uc_clr ON uc_clr.booking_id = b.id AND uc_clr.confirmer_role = 'clearing_agent'
       WHERE 1 = 1 ${where}
       ORDER BY b.flight_date DESC, b.id DESC`,
      params
    );

    const bookingIds = [...new Set(rows.map((r) => r.booking_id).filter(Boolean))];
    const awbCountMap = new Map();
    if (bookingIds.length) {
      const placeholders = bookingIds.map(() => "?").join(",");
      const awbRows = await query(
        `SELECT booking_id, COUNT(DISTINCT TRIM(awb_number)) AS c
         FROM uplift_notifications
         WHERE booking_id IN (${placeholders})
           AND awb_number IS NOT NULL
           AND TRIM(awb_number) <> ''
         GROUP BY booking_id`,
        bookingIds
      );
      for (const ar of awbRows) {
        awbCountMap.set(Number(ar.booking_id), Number(ar.c) || 0);
      }
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Weekly Invoices");
    sheet.columns = [
      { header: "Date", key: "date", width: 14 },
      { header: "Booking ID", key: "booking_id", width: 12 },
      { header: "Exporter", key: "exporter", width: 28 },
      { header: "Airline", key: "airline", width: 22 },
      { header: "AWB Code", key: "awb", width: 22 },
      { header: "Destination", key: "destination", width: 18 },
      { header: "Uplifted KG", key: "uplifted_kg", width: 14 },
      { header: "Pricing model", key: "pricing_model", width: 14 },
      { header: "Billable units", key: "billable_units", width: 14 },
      { header: "Unit price", key: "unit_price", width: 14 },
      { header: "Total Amount (USD)", key: "total", width: 18 }
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF87CEEB" }
    };

    let totalKg = 0;
    let totalAmount = 0;
    for (const row of rows) {
      const kg = Number(row.uplifted_kg) || 0;
      const priceKg = Number(row.price_per_kg) || 0;
      const model = String(row.pricing_model || "per_kg").toLowerCase() === "per_awb" ? "per_awb" : "per_kg";
      const priceAwb = row.price_per_awb == null || row.price_per_awb === "" ? null : Number(row.price_per_awb);
      const rawAwbs = awbCountMap.get(Number(row.booking_id)) || 0;
      const awbBill = rawAwbs > 0 ? rawAwbs : 1;
      const usePerAwb = model === "per_awb" && priceAwb != null && Number.isFinite(priceAwb);
      const billableUnits = usePerAwb ? awbBill : kg;
      const unitPrice = usePerAwb ? priceAwb : priceKg;
      const amount = +(billableUnits * unitPrice).toFixed(2);
      totalKg += kg;
      totalAmount += amount;
      sheet.addRow({
        date: row.flight_date ? String(row.flight_date).slice(0, 10) : "",
        booking_id: row.booking_id,
        exporter: row.exporter_name || "",
        airline: row.airline_name || "",
        awb: row.awb_number || "",
        destination: row.destination || "",
        uplifted_kg: kg,
        pricing_model: usePerAwb ? "per_awb" : "per_kg",
        billable_units: billableUnits,
        unit_price: unitPrice,
        total: amount
      });
    }

    const totalsRow = sheet.addRow({
      exporter: "TOTAL",
      uplifted_kg: totalKg,
      total: +totalAmount.toFixed(2)
    });
    totalsRow.font = { bold: true };
    totalsRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE6F4FF" }
    };

    const datePart = new Date().toISOString().slice(0, 10);
    const fileName = `Weekly-Invoices-${datePart}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    const buffer = await workbook.xlsx.writeBuffer();
    return res.send(buffer);
  } catch (error) {
    return next(error);
  }
}

async function listInvoices(req, res, next) {
  try {
    const { exporter_id, status, start_date, end_date, q } = req.query || {};

    let sql = `
      SELECT
        i.*,
        e.name AS exporter_name,
        CASE
          WHEN i.status = 'paid' THEN 'paid'
          WHEN i.due_date IS NOT NULL AND i.due_date < CURDATE() AND i.status <> 'paid' THEN 'overdue'
          WHEN i.status = 'pending' OR i.status = 'unpaid' THEN 'unpaid'
          ELSE COALESCE(i.status, 'unpaid')
        END AS computed_status,
        (
          SELECT GROUP_CONCAT(DISTINCT un.awb_number ORDER BY un.id DESC SEPARATOR ', ')
          FROM uplift_notifications un
          JOIN invoice_lines il ON il.booking_id = un.booking_id
          WHERE il.invoice_id = i.id AND un.awb_number IS NOT NULL AND un.awb_number <> ''
        ) AS awb_numbers,
        (
          SELECT COALESCE(SUM(il2.quantity_kg), 0)
          FROM invoice_lines il2
          WHERE il2.invoice_id = i.id
        ) AS total_kg,
        (
          SELECT GROUP_CONCAT(DISTINCT il3.booking_id ORDER BY il3.booking_id SEPARATOR ', ')
          FROM invoice_lines il3
          WHERE il3.invoice_id = i.id
        ) AS booking_ids
      FROM invoices i
      JOIN exporters e ON i.exporter_id = e.id
      WHERE 1=1
    `;
    const params = [];

    if (req.user.role === "exporter") {
      sql += " AND i.exporter_id = ?";
      params.push(req.user.linked_exporter_id);
    } else if (exporter_id) {
      sql += " AND i.exporter_id = ?";
      params.push(Number(exporter_id));
    }

    if (status === "paid") {
      sql += " AND i.status = 'paid'";
    } else if (status === "unpaid") {
      sql += " AND (i.status = 'pending' OR i.status = 'unpaid') AND (i.due_date IS NULL OR i.due_date >= CURDATE())";
    } else if (status === "overdue") {
      sql += " AND i.status <> 'paid' AND i.due_date IS NOT NULL AND i.due_date < CURDATE()";
    }

    if (start_date) {
      sql += " AND i.created_at >= ?";
      params.push(start_date);
    }
    if (end_date) {
      sql += " AND i.created_at <= ?";
      params.push(`${end_date} 23:59:59`);
    }

    if (q && String(q).trim()) {
      const like = `%${String(q).trim()}%`;
      sql += " AND (i.invoice_number LIKE ? OR e.name LIKE ?)";
      params.push(like, like);
    }

    sql += " ORDER BY i.created_at DESC";
    const rows = await query(sql, params);
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
}

async function getFinanceDashboard(req, res, next) {
  try {
    let exporterFilter = "";
    const params = [];

    if (req.user.role === "exporter") {
      exporterFilter = "WHERE b.exporter_id = ?";
      params.push(req.user.linked_exporter_id);
    }

    const uplift = await query(
      `SELECT b.exporter_id, e.name exporter_name, SUM(uc.actual_kg) confirmed_kg
       FROM uplift_confirmations uc
       JOIN bookings b ON uc.booking_id = b.id
       JOIN exporters e ON b.exporter_id = e.id
       ${exporterFilter}
       GROUP BY b.exporter_id, e.name`,
      params
    );

    const invoiceStatus = await query(`SELECT status, COUNT(*) count, SUM(total_amount) total FROM invoices GROUP BY status`);

    return res.json({ uplift, invoiceStatus });
  } catch (error) {
    return next(error);
  }
}

async function markInvoicePaid(req, res, next) {
  try {
    const { id } = req.params;
    const rows = await query(`SELECT id, exporter_id FROM invoices WHERE id = ? LIMIT 1`, [id]);
    if (!rows.length) return res.status(404).json({ message: "Invoice not found" });

    await query(`UPDATE invoices SET status = 'paid', paid_at = NOW() WHERE id = ?`, [id]);
    await query(`UPDATE exporters SET is_locked = 0 WHERE id = ?`, [rows[0].exporter_id]);
    await query(`UPDATE users SET is_locked = 0 WHERE linked_exporter_id = ?`, [rows[0].exporter_id]);

    return res.json({ message: "Invoice marked as paid" });
  } catch (error) {
    return next(error);
  }
}

async function runWeeklyInvoiceNow(req, res, next) {
  try {
    await processWeeklyInvoices();
    return res.json({ message: "Weekly invoice job executed" });
  } catch (error) {
    return next(error);
  }
}

async function loadInvoiceForDownload(req, res) {
  const { id } = req.params;
  const rows = await query(
    `SELECT i.*, e.name AS exporter_name,
       CASE
         WHEN i.status = 'paid' THEN 'paid'
         WHEN i.due_date IS NOT NULL AND i.due_date < CURDATE() AND i.status <> 'paid' THEN 'overdue'
         WHEN i.status = 'pending' OR i.status = 'unpaid' THEN 'unpaid'
         ELSE COALESCE(i.status, 'unpaid')
       END AS computed_status
     FROM invoices i
     JOIN exporters e ON i.exporter_id = e.id
     WHERE i.id = ? LIMIT 1`,
    [id]
  );
  if (!rows.length) {
    res.status(404).json({ message: "Invoice not found" });
    return null;
  }
  const inv = rows[0];
  if (req.user.role === "exporter" && Number(req.user.linked_exporter_id) !== Number(inv.exporter_id)) {
    res.status(403).json({ message: "You do not have access to this invoice" });
    return null;
  }

  const lines = await query(
    `SELECT
       il.description,
       il.quantity_kg,
       il.unit_price,
       il.total_price,
       il.booking_id,
       il.created_at AS line_created_at,
       b.flight_date,
       b.destination,
       a.name AS airline_name,
       e.name AS line_exporter_name,
       ua.actual_kg AS airline_supervisor_kg,
       uc.actual_kg AS clearing_agent_kg,
       un.awb_number
     FROM invoice_lines il
     LEFT JOIN bookings b ON il.booking_id = b.id
     LEFT JOIN airlines a ON b.airline_id = a.id
     LEFT JOIN exporters e ON b.exporter_id = e.id
     LEFT JOIN uplift_confirmations ua ON ua.booking_id = b.id AND ua.confirmer_role = 'airline_supervisor'
     LEFT JOIN uplift_confirmations uc ON uc.booking_id = b.id AND uc.confirmer_role = 'clearing_agent'
     LEFT JOIN (
       SELECT u1.booking_id, u1.awb_number, u1.created_at
       FROM uplift_notifications u1
       JOIN (
         SELECT booking_id, MAX(id) AS max_id
         FROM uplift_notifications
         GROUP BY booking_id
       ) latest ON latest.max_id = u1.id
     ) un ON un.booking_id = b.id
     WHERE il.invoice_id = ?
     ORDER BY il.id ASC`,
    [id]
  );

  return { invoice: inv, lines };
}

async function downloadInvoicePdf(req, res, next) {
  try {
    const data = await loadInvoiceForDownload(req, res);
    if (!data) return;
    const buffer = await buildInvoicePdf({
      invoice: data.invoice,
      lines: data.lines,
      exporterName: data.invoice.exporter_name
    });
    const safeName = String(data.invoice.invoice_number || `invoice-${req.params.id}`).replace(/[^\w.-]+/g, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}.pdf"`);
    return res.send(buffer);
  } catch (error) {
    return next(error);
  }
}

async function downloadInvoiceExcel(req, res, next) {
  try {
    const data = await loadInvoiceForDownload(req, res);
    if (!data) return;
    const inv = data.invoice;
    const lines = data.lines;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "SBU Export Coordination Hub";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Invoice", {
      properties: { defaultRowHeight: 18 },
      views: [{ showGridLines: false }]
    });

    /* ===== Branded header band ===== */
    sheet.mergeCells("A1:H3");
    const titleCell = sheet.getCell("A1");
    titleCell.value = "SBU EXPORT COORDINATION HUB — INVOICE";
    titleCell.font = { bold: true, size: 18, color: { argb: "FFFFFFFF" } };
    titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    titleCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0B51AA" }
    };

    sheet.mergeCells("A4:H4");
    const taglineCell = sheet.getCell("A4");
    taglineCell.value = "Air cargo coordination · Booking · Uplift · Settlement   |   https://sbuexport.com   |   finance@sbu.rw";
    taglineCell.font = { italic: true, size: 10, color: { argb: "FF155EAB" } };
    taglineCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    taglineCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF4FF" } };

    /* ===== Bill-to / meta block ===== */
    sheet.getCell("A6").value = "BILL TO";
    sheet.getCell("A6").font = { bold: true, size: 10, color: { argb: "FF0B51AA" } };
    sheet.getCell("A7").value = inv.exporter_name || "Exporter";
    sheet.getCell("A7").font = { bold: true, size: 13 };
    sheet.getCell("A8").value = "Exporter account · billing recipient";
    sheet.getCell("A8").font = { size: 9, color: { argb: "FF607080" } };

    const meta = [
      ["Invoice #", String(inv.invoice_number || `INV-${inv.id}`)],
      ["Period", `${(inv.start_date ? String(inv.start_date).slice(0, 10) : "—")} → ${(inv.end_date ? String(inv.end_date).slice(0, 10) : "—")}`],
      ["Due date", inv.due_date ? String(inv.due_date).slice(0, 10) : "—"],
      ["Status", String(inv.computed_status || inv.status || "unpaid").toUpperCase()],
      ["Currency", String(inv.currency || "USD").toUpperCase()],
      ["Generated", inv.created_at ? new Date(inv.created_at).toISOString().slice(0, 16).replace("T", " ") : "—"]
    ];
    meta.forEach((pair, idx) => {
      const r = 6 + idx;
      sheet.getCell(`G${r}`).value = pair[0];
      sheet.getCell(`G${r}`).font = { bold: true, size: 9, color: { argb: "FF607080" } };
      sheet.getCell(`G${r}`).alignment = { horizontal: "right" };
      sheet.mergeCells(`H${r}:H${r}`);
      sheet.getCell(`H${r}`).value = pair[1];
      sheet.getCell(`H${r}`).font = { size: 10, bold: true };
      sheet.getCell(`H${r}`).alignment = { horizontal: "left" };
    });

    const computeUpliftedKg = (row) => {
      const billed = Number(row.quantity_kg);
      if (Number.isFinite(billed) && billed > 0) return billed;
      const sup = Number(row.airline_supervisor_kg || 0);
      const clr = Number(row.clearing_agent_kg || 0);
      if (sup > 0 && clr > 0) return Math.min(sup, clr);
      if (sup > 0) return sup;
      if (clr > 0) return clr;
      return 0;
    };

    /* ===== Shipment table — Uplifted (kg) is always a number (never blank) ===== */
    const headerRowIdx = 13;
    sheet.getRow(headerRowIdx).values = [
      "Booking ID",
      "Airline",
      "Exporter",
      "Date flight",
      "Destination",
      "AWB code",
      "Uplifted (kg)",
      "Created"
    ];
    const headerRow = sheet.getRow(headerRowIdx);
    headerRow.height = 24;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B51AA" } };
      cell.border = {
        top: { style: "thin", color: { argb: "FFB6CDE4" } },
        left: { style: "thin", color: { argb: "FFB6CDE4" } },
        bottom: { style: "thin", color: { argb: "FFB6CDE4" } },
        right: { style: "thin", color: { argb: "FFB6CDE4" } }
      };
    });

    sheet.columns = [
      { key: "booking_id", width: 14 },
      { key: "airline", width: 22 },
      { key: "exporter", width: 26 },
      { key: "flight_date", width: 14 },
      { key: "destination", width: 16 },
      { key: "awb", width: 22 },
      { key: "uplifted_kg", width: 18 },
      { key: "created", width: 20 }
    ];

    let dataRowIdx = headerRowIdx + 1;
    let totalUplifted = 0;

    if (lines.length === 0) {
      sheet.mergeCells(`A${dataRowIdx}:H${dataRowIdx}`);
      const c = sheet.getCell(`A${dataRowIdx}`);
      c.value = "No shipment data recorded for this invoice.";
      c.font = { italic: true, color: { argb: "FF607080" } };
      c.alignment = { horizontal: "center" };
      dataRowIdx += 1;
    } else {
      lines.forEach((row, idx) => {
        const upliftedKg = computeUpliftedKg(row);
        totalUplifted += upliftedKg;
        const r = sheet.getRow(dataRowIdx);
        r.values = [
          row.booking_id ? `#${row.booking_id}` : "—",
          row.airline_name || "—",
          row.line_exporter_name || inv.exporter_name || "—",
          row.flight_date ? String(row.flight_date).slice(0, 10) : "—",
          row.destination || "—",
          row.awb_number || "—",
          upliftedKg,
          row.line_created_at
            ? new Date(row.line_created_at).toISOString().slice(0, 16).replace("T", " ")
            : "—"
        ];
        r.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cell.alignment = { vertical: "middle", horizontal: colNumber === 7 ? "right" : "left" };
          cell.font = { size: 10 };
          cell.border = {
            top: { style: "hair", color: { argb: "FFD7E3F0" } },
            left: { style: "hair", color: { argb: "FFD7E3F0" } },
            bottom: { style: "hair", color: { argb: "FFD7E3F0" } },
            right: { style: "hair", color: { argb: "FFD7E3F0" } }
          };
          if (idx % 2 === 1) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF6FAFF" } };
          }
          if (colNumber === 7) {
            cell.numFmt = "#,##0.##";
          }
        });
        dataRowIdx += 1;
      });

      /* totals row */
      const tr = sheet.getRow(dataRowIdx);
      tr.values = ["TOTAL", "", "", "", "", "", totalUplifted, ""];
      tr.eachCell((cell, colNumber) => {
        cell.font = { bold: true, color: { argb: "FF0B51AA" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF4FF" } };
        cell.alignment = { horizontal: colNumber === 7 ? "right" : "left" };
        cell.border = {
          top: { style: "thin", color: { argb: "FF0B51AA" } },
          bottom: { style: "thin", color: { argb: "FF0B51AA" } }
        };
        if (colNumber === 7) cell.numFmt = "#,##0.##";
      });
      dataRowIdx += 1;
    }

    /* ===== Amount due card ===== */
    const dueRow = dataRowIdx + 2;
    sheet.mergeCells(`G${dueRow}:H${dueRow}`);
    sheet.getCell(`G${dueRow}`).value = "AMOUNT DUE";
    sheet.getCell(`G${dueRow}`).font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    sheet.getCell(`G${dueRow}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B51AA" } };
    sheet.getCell(`G${dueRow}`).alignment = { horizontal: "right", indent: 1 };

    sheet.mergeCells(`G${dueRow + 1}:H${dueRow + 1}`);
    const dueCell = sheet.getCell(`G${dueRow + 1}`);
    dueCell.value = `${String(inv.currency || "USD").toUpperCase()} ${Number(inv.total_amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    dueCell.font = { bold: true, size: 16, color: { argb: "FF0B51AA" } };
    dueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF4FF" } };
    dueCell.alignment = { horizontal: "right", indent: 1 };

    /* ===== Footer ===== */
    const footerRow = dueRow + 4;
    sheet.mergeCells(`A${footerRow}:H${footerRow}`);
    const footCell = sheet.getCell(`A${footerRow}`);
    footCell.value =
      "Charges are assessed per AWB / uplift line as shown. Quote the invoice number on payment. Questions? finance@sbu.rw";
    footCell.font = { italic: true, color: { argb: "FF607080" } };
    footCell.alignment = { horizontal: "center" };

    /* Embed logo if available */
    try {
      const logoPath = path.join(__dirname, "..", "assets", "invoice-logo.png");
      if (fs.existsSync(logoPath)) {
        const imgId = workbook.addImage({
          filename: logoPath,
          extension: "png"
        });
        sheet.addImage(imgId, {
          tl: { col: 0.1, row: 0.2 },
          ext: { width: 110, height: 50 }
        });
      }
    } catch {
      /* ignore logo issues */
    }

    const safeName = String(inv.invoice_number || `invoice-${req.params.id}`).replace(/[^\w.-]+/g, "_");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}.xlsx"`);
    const buffer = await workbook.xlsx.writeBuffer();
    return res.send(buffer);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listInvoices,
  getFinanceDashboard,
  markInvoicePaid,
  runWeeklyInvoiceNow,
  downloadInvoicePdf,
  downloadInvoiceExcel,
  listExporterPricing,
  upsertExporterPricing,
  downloadWeeklyInvoiceReport
};
