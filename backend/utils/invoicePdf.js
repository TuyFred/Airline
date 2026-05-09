const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");

/* SBU brand palette — light, breezy, airline / cargo feel */
const BRAND_BLUE = rgb(0.043, 0.318, 0.667); // deep navy blue
const BRAND_SKY = rgb(0.22, 0.74, 0.96);     // sky blue
const BRAND_GREEN = rgb(0.06, 0.63, 0.23);   // fresh-cargo green
const TEXT_DARK = rgb(0.06, 0.10, 0.18);
const TEXT_MUTED = rgb(0.40, 0.45, 0.52);
const LINE_GRAY = rgb(0.84, 0.89, 0.94);
const HEADER_FILL = rgb(0.92, 0.96, 1.0);
const ROW_ALT = rgb(0.97, 0.99, 1.0);
const BG_BANNER = rgb(0.95, 0.98, 1.0);
const ACCENT_AMBER = rgb(0.96, 0.62, 0.10);

function formatMoney(n) {
  const x = Number(n || 0);
  return x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatKg(n) {
  const x = Number(n || 0);
  return x.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatDate(d) {
  if (!d) return "—";
  const s = String(d);
  return s.slice(0, 10);
}

function formatDateTime(d) {
  if (!d) return "—";
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return formatDate(d);
    const date = dt.toISOString().slice(0, 10);
    const time = dt.toISOString().slice(11, 16);
    return `${date} ${time}`;
  } catch {
    return formatDate(d);
  }
}

function pdfSafeText(text) {
  return String(text ?? "")
    .replace(/\u2192/g, "->")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[^\u0009\u000A\u000D\u0020-\u024F\u1E00-\u1EFF]/g, "?");
}

function fitText(text, maxChars) {
  const safe = pdfSafeText(text);
  if (safe.length <= maxChars) return safe;
  if (maxChars <= 3) return safe.slice(0, maxChars);
  return `${safe.slice(0, maxChars - 1)}…`;
}

function wrapWords(text, maxChars) {
  const words = pdfSafeText(text).trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length <= maxChars) line = next;
    else {
      if (line) lines.push(line);
      line = w.length > maxChars ? `${w.slice(0, maxChars - 3)}...` : w;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : ["—"];
}

async function buildInvoicePdf({ invoice, lines, exporterName }) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const W = page.getWidth();
  const H = page.getHeight();
  const margin = 38;
  const contentW = W - margin * 2;

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  /* ─── decorative top bar (sky → navy gradient feel using two rectangles) ─── */
  page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: BRAND_SKY });
  page.drawRectangle({ x: 0, y: H - 12, width: W, height: 6, color: BRAND_BLUE });

  let y = H - 30;

  /* ─── Header row: logo (left) + brand info + INVOICE title (right) ─── */
  const logoPath = path.join(__dirname, "..", "assets", "invoice-logo.png");
  let headerBottom = y;

  if (fs.existsSync(logoPath)) {
    try {
      const png = await pdfDoc.embedPng(fs.readFileSync(logoPath));
      const logoW = 132;
      const scale = logoW / png.width;
      const logoH = png.height * scale;
      headerBottom = y - logoH;
      page.drawImage(png, { x: margin, y: headerBottom, width: logoW, height: logoH });
    } catch {
      /* if logo broken, fall back to text-only header */
    }
  }

  /* Tag-line block under the logo */
  page.drawText("SBU EXPORT COORDINATION HUB", {
    x: margin,
    y: headerBottom - 14,
    size: 8.5,
    font: fontBold,
    color: BRAND_BLUE
  });
  page.drawText("Air cargo coordination · Booking · Uplift · Settlement", {
    x: margin,
    y: headerBottom - 24,
    size: 7.5,
    font,
    color: TEXT_MUTED
  });
  page.drawText("https://sbuexport.com  ·  finance@sbu.rw", {
    x: margin,
    y: headerBottom - 34,
    size: 7.5,
    font,
    color: BRAND_GREEN
  });

  /* INVOICE title block (right side) */
  const title = "INVOICE";
  const titleSize = 26;
  const titleW = fontBold.widthOfTextAtSize(title, titleSize);
  page.drawText(title, {
    x: W - margin - titleW,
    y: y - titleSize,
    size: titleSize,
    font: fontBold,
    color: BRAND_BLUE
  });

  /* Invoice number badge */
  const invNumber = String(invoice.invoice_number || `INV-${invoice.id}`);
  const invNumberW = fontBold.widthOfTextAtSize(invNumber, 11);
  const badgeW = invNumberW + 22;
  const badgeH = 22;
  const badgeX = W - margin - badgeW;
  const badgeY = y - titleSize - 12 - badgeH;
  page.drawRectangle({
    x: badgeX,
    y: badgeY,
    width: badgeW,
    height: badgeH,
    color: BRAND_SKY,
    borderColor: BRAND_BLUE,
    borderWidth: 0.6
  });
  page.drawText(invNumber, {
    x: badgeX + 11,
    y: badgeY + 7,
    size: 11,
    font: fontBold,
    color: rgb(1, 1, 1)
  });

  /* Status pill below the badge */
  const statusValue = String(invoice.computed_status || invoice.status || "unpaid").toLowerCase();
  const statusLabel = statusValue.toUpperCase();
  const statusColor =
    statusValue === "paid" ? BRAND_GREEN : statusValue === "overdue" ? rgb(0.85, 0.2, 0.25) : ACCENT_AMBER;
  const statusW = fontBold.widthOfTextAtSize(statusLabel, 9) + 18;
  page.drawRectangle({
    x: W - margin - statusW,
    y: badgeY - 26,
    width: statusW,
    height: 18,
    color: statusColor
  });
  page.drawText(statusLabel, {
    x: W - margin - statusW + 9,
    y: badgeY - 26 + 5,
    size: 9,
    font: fontBold,
    color: rgb(1, 1, 1)
  });

  y = Math.min(headerBottom - 44, badgeY - 36);

  /* ─── Bill-To / Meta side-by-side ─── */
  const cardH = 92;
  const cardGap = 12;
  const cardW = (contentW - cardGap) / 2;

  /* Bill To */
  page.drawRectangle({
    x: margin,
    y: y - cardH,
    width: cardW,
    height: cardH,
    color: BG_BANNER,
    borderColor: LINE_GRAY,
    borderWidth: 0.6
  });
  page.drawRectangle({ x: margin, y: y - 4, width: cardW, height: 4, color: BRAND_SKY });
  page.drawText("BILL TO", {
    x: margin + 12,
    y: y - 22,
    size: 8.5,
    font: fontBold,
    color: BRAND_BLUE
  });
  page.drawText(pdfSafeText(exporterName || "Exporter"), {
    x: margin + 12,
    y: y - 40,
    size: 13,
    font: fontBold,
    color: TEXT_DARK
  });
  page.drawText("Exporter account · billing recipient", {
    x: margin + 12,
    y: y - 56,
    size: 8.5,
    font,
    color: TEXT_MUTED
  });
  page.drawText(`Generated: ${formatDateTime(invoice.created_at)}`, {
    x: margin + 12,
    y: y - 72,
    size: 8.5,
    font,
    color: TEXT_MUTED
  });

  /* Invoice details */
  const metaX = margin + cardW + cardGap;
  page.drawRectangle({
    x: metaX,
    y: y - cardH,
    width: cardW,
    height: cardH,
    color: BG_BANNER,
    borderColor: LINE_GRAY,
    borderWidth: 0.6
  });
  page.drawRectangle({ x: metaX, y: y - 4, width: cardW, height: 4, color: BRAND_GREEN });

  const metaPairs = [
    ["Invoice #", String(invoice.invoice_number || `INV-${invoice.id}`)],
    ["Period", `${formatDate(invoice.start_date)} → ${formatDate(invoice.end_date)}`],
    ["Due date", formatDate(invoice.due_date)],
    ["Currency", String(invoice.currency || "USD").toUpperCase()]
  ];
  let metaY = y - 22;
  for (const [label, value] of metaPairs) {
    page.drawText(label, { x: metaX + 12, y: metaY, size: 8, font: fontBold, color: TEXT_MUTED });
    page.drawText(pdfSafeText(value), {
      x: metaX + 78,
      y: metaY,
      size: 9,
      font,
      color: TEXT_DARK
    });
    metaY -= 16;
  }

  y -= cardH + 18;

  /* ─── Shipment table — the main "invoice format" the user asked for ─── */
  page.drawText("Shipment line items", {
    x: margin,
    y,
    size: 11,
    font: fontBold,
    color: BRAND_BLUE
  });
  y -= 14;

  /*
    Columns (must match the requested order):
    Booking ID | Airline | Exporter | Date flight | Destination | AWB code | Supervisor kgs | Clearing kgs | Created
    The total widths must equal contentW.
  */
  const cols = [
    { key: "booking_id",            label: "Booking ID", w: 0.085 },
    { key: "airline_name",          label: "Airline",    w: 0.110 },
    { key: "line_exporter_name",    label: "Exporter",   w: 0.140 },
    { key: "flight_date",           label: "Flight date", w: 0.105 },
    { key: "destination",           label: "Destination", w: 0.100 },
    { key: "awb_number",            label: "AWB code",   w: 0.110 },
    { key: "airline_supervisor_kg", label: "Sup. kgs",   w: 0.090, align: "right" },
    { key: "clearing_agent_kg",     label: "Agent kgs",  w: 0.090, align: "right" },
    { key: "line_created_at",       label: "Created",    w: 0.170 }
  ];

  /* Compute absolute x positions */
  let cursor = margin;
  for (const c of cols) {
    c.width = contentW * c.w;
    c.x = cursor;
    cursor += c.width;
  }

  const headerH = 22;
  const rowH = 20;
  const cellPad = 5;

  /* Header background */
  page.drawRectangle({
    x: margin,
    y: y - headerH,
    width: contentW,
    height: headerH,
    color: BRAND_BLUE
  });
  for (const c of cols) {
    const label = pdfSafeText(c.label);
    const tw = fontBold.widthOfTextAtSize(label, 8.5);
    const tx = c.align === "right" ? c.x + c.width - cellPad - tw : c.x + cellPad;
    page.drawText(label, {
      x: tx,
      y: y - headerH + 7,
      size: 8.5,
      font: fontBold,
      color: rgb(1, 1, 1)
    });
  }
  y -= headerH;

  const safeLines = Array.isArray(lines) ? lines : [];
  const shipmentRows = safeLines.length ? safeLines : [];

  let totalKgSup = 0;
  let totalKgAgent = 0;
  let totalAmount = 0;

  if (shipmentRows.length === 0) {
    page.drawRectangle({
      x: margin,
      y: y - rowH,
      width: contentW,
      height: rowH,
      borderColor: LINE_GRAY,
      borderWidth: 0.4
    });
    page.drawText("No shipment data recorded for this invoice.", {
      x: margin + cellPad,
      y: y - rowH + 6,
      size: 8.5,
      font: fontItalic,
      color: TEXT_MUTED
    });
    y -= rowH;
  } else {
    shipmentRows.slice(0, 14).forEach((row, idx) => {
      const supKg = Number(row.airline_supervisor_kg || row.quantity_kg || 0);
      const agentKg = Number(row.clearing_agent_kg || 0);
      const amount = Number(row.total_price || 0);
      totalKgSup += supKg;
      totalKgAgent += agentKg;
      totalAmount += amount;

      const fill = idx % 2 === 1 ? ROW_ALT : null;
      if (fill) {
        page.drawRectangle({ x: margin, y: y - rowH, width: contentW, height: rowH, color: fill });
      }
      page.drawRectangle({
        x: margin,
        y: y - rowH,
        width: contentW,
        height: rowH,
        borderColor: LINE_GRAY,
        borderWidth: 0.4
      });

      const values = {
        booking_id: row.booking_id ? `#${row.booking_id}` : "—",
        airline_name: row.airline_name || "—",
        line_exporter_name: row.line_exporter_name || exporterName || "—",
        flight_date: formatDate(row.flight_date),
        destination: row.destination || "—",
        awb_number: row.awb_number || "—",
        airline_supervisor_kg: formatKg(supKg),
        clearing_agent_kg: formatKg(agentKg),
        line_created_at: formatDateTime(row.line_created_at || invoice.created_at)
      };

      for (const c of cols) {
        const charsAvail = Math.max(4, Math.floor(c.width / 4));
        const text = fitText(values[c.key], charsAvail);
        const tw = font.widthOfTextAtSize(text, 8);
        const tx = c.align === "right" ? c.x + c.width - cellPad - tw : c.x + cellPad;
        page.drawText(text, {
          x: tx,
          y: y - rowH + 6,
          size: 8,
          font,
          color: TEXT_DARK
        });
      }
      y -= rowH;
    });

    /* footer row with totals */
    page.drawRectangle({
      x: margin,
      y: y - rowH,
      width: contentW,
      height: rowH,
      color: HEADER_FILL,
      borderColor: BRAND_BLUE,
      borderWidth: 0.6
    });
    page.drawText("TOTAL", {
      x: margin + cellPad,
      y: y - rowH + 6,
      size: 9,
      font: fontBold,
      color: BRAND_BLUE
    });
    const supCol = cols.find((c) => c.key === "airline_supervisor_kg");
    const agentCol = cols.find((c) => c.key === "clearing_agent_kg");
    const supText = formatKg(totalKgSup);
    const agentText = formatKg(totalKgAgent);
    const supTw = fontBold.widthOfTextAtSize(supText, 9);
    const agentTw = fontBold.widthOfTextAtSize(agentText, 9);
    page.drawText(supText, {
      x: supCol.x + supCol.width - cellPad - supTw,
      y: y - rowH + 6,
      size: 9,
      font: fontBold,
      color: BRAND_BLUE
    });
    page.drawText(agentText, {
      x: agentCol.x + agentCol.width - cellPad - agentTw,
      y: y - rowH + 6,
      size: 9,
      font: fontBold,
      color: BRAND_BLUE
    });
    y -= rowH;
  }

  y -= 22;

  /* ─── Totals strip ─── */
  const totalsW = 220;
  const totalsX = W - margin - totalsW;
  page.drawRectangle({
    x: totalsX,
    y: y - 56,
    width: totalsW,
    height: 56,
    color: BRAND_BLUE
  });
  page.drawRectangle({
    x: totalsX,
    y: y - 56,
    width: 4,
    height: 56,
    color: BRAND_GREEN
  });
  page.drawText("AMOUNT DUE", {
    x: totalsX + 14,
    y: y - 18,
    size: 9,
    font: fontBold,
    color: rgb(0.85, 0.95, 1)
  });
  const totalDueValue = `${String(invoice.currency || "USD").toUpperCase()} ${formatMoney(invoice.total_amount || totalAmount)}`;
  const totalDueW = fontBold.widthOfTextAtSize(totalDueValue, 18);
  page.drawText(totalDueValue, {
    x: totalsX + totalsW - 14 - totalDueW,
    y: y - 42,
    size: 18,
    font: fontBold,
    color: rgb(1, 1, 1)
  });

  /* Subtotal line on the left */
  const subY = y - 24;
  const summaryItems = [
    [`Supervisor verified kgs`, formatKg(totalKgSup)],
    [`Clearing-agent verified kgs`, formatKg(totalKgAgent)],
    [`Lines counted`, String(shipmentRows.length || 0)]
  ];
  summaryItems.forEach((pair, i) => {
    page.drawText(pair[0], {
      x: margin,
      y: subY - i * 14,
      size: 8.5,
      font,
      color: TEXT_MUTED
    });
    page.drawText(pdfSafeText(pair[1]), {
      x: margin + 180,
      y: subY - i * 14,
      size: 8.5,
      font: fontBold,
      color: TEXT_DARK
    });
  });

  y -= 70;

  /* ─── Footer note + cargo divider ─── */
  page.drawRectangle({
    x: margin,
    y: y - 4,
    width: contentW,
    height: 4,
    color: BRAND_SKY
  });
  y -= 16;
  const foot =
    "Thank you for shipping with SBU. Please quote the invoice number on payment. " +
    "Questions? Reach out to finance@sbu.rw or your dedicated SBU coordinator.";
  wrapWords(foot, 110).forEach((fl, i) => {
    page.drawText(fl, {
      x: margin,
      y: y - i * 11,
      size: 8.5,
      font,
      color: TEXT_MUTED
    });
  });

  /* Decorative bottom bar */
  page.drawRectangle({ x: 0, y: 0, width: W, height: 6, color: BRAND_BLUE });
  page.drawRectangle({ x: 0, y: 6, width: W, height: 4, color: BRAND_SKY });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

module.exports = { buildInvoicePdf };
