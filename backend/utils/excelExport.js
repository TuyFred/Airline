const ExcelJS = require('exceljs');

const BRAND_BLUE  = 'FF0052CC';
const BRAND_GREEN = 'FF00875A';
const HEADER_TEXT = 'FFFFFFFF';
const ALT_ROW_BLUE  = 'FFEEF4FF';
const ALT_ROW_GREEN = 'FFEBFAF0';
const BORDER = { style: 'thin', color: { argb: 'FFD0D8E8' } };
const ALL_BORDERS = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };

function headerStyle(fgColor) {
  return {
    font: { bold: true, color: { argb: HEADER_TEXT }, size: 11 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: fgColor } },
    alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
    border: ALL_BORDERS
  };
}

function applyHeader(worksheet, color) {
  const row = worksheet.getRow(1);
  row.height = 32;
  row.eachCell((cell) => Object.assign(cell, headerStyle(color)));
}

async function generateBookingsExcel(bookingsData, exporterName) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SBU Air Cargo Hub';
  workbook.created = new Date();

  const ws = workbook.addWorksheet('Bookings', {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { orientation: 'landscape', fitToPage: true }
  });

  ws.columns = [
    { header: 'Booking ID',    key: 'id',           width: 12 },
    { header: 'Airline',       key: 'airline',       width: 18 },
    { header: 'Flight Date',   key: 'flight_date',   width: 14 },
    { header: 'Destination',   key: 'destination',   width: 14 },
    { header: 'Transit',       key: 'transit',       width: 12 },
    { header: 'Skids',         key: 'skids',         width: 10 },
    { header: 'Tonnage (kg)',  key: 'tonnage_kg',    width: 14 },
    { header: 'Commodity',     key: 'commodity',     width: 20 },
    { header: 'BSA Type',      key: 'bsa_type',      width: 12 },
    { header: 'Status',        key: 'status',        width: 13 },
    { header: 'Created',       key: 'created_at',    width: 18 },
  ];

  applyHeader(ws, BRAND_BLUE);

  bookingsData.forEach((b, i) => {
    const row = ws.addRow({
      id:          b.id,
      airline:     b.airline || '',
      flight_date: String(b.flight_date || '').slice(0, 10),
      destination: b.destination || '',
      transit:     b.transit_airport || '',
      skids:       Number(b.skids || 0),
      tonnage_kg:  Number(b.tonnage_kg || 0),
      commodity:   b.commodity || '',
      bsa_type:    b.bsa_type || 'N/A',
      status:      String(b.status || 'pending').toUpperCase(),
      created_at:  b.created_at ? new Date(b.created_at).toLocaleString('en-US') : '',
    });

    if (i % 2 === 1) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_ROW_BLUE } };
    }

    // Colour status cell
    const statusCell = row.getCell('status');
    const s = String(b.status || '');
    if (s === 'approved')  { statusCell.font = { bold: true, color: { argb: 'FF006400' } }; }
    if (s === 'pending')   { statusCell.font = { bold: true, color: { argb: 'FF996600' } }; }
    if (s === 'rejected' || s === 'cancelled') { statusCell.font = { bold: true, color: { argb: 'FF990000' } }; }

    row.eachCell((cell) => {
      cell.border = ALL_BORDERS;
      if (!cell.alignment) cell.alignment = { vertical: 'middle' };
    });

    row.height = 20;
  });

  // Summary section
  const gap = ws.rowCount + 2;
  const titleCell = ws.getCell(`A${gap}`);
  titleCell.value = `BOOKING SUMMARY — ${exporterName}`;
  titleCell.font = { bold: true, size: 12, color: { argb: BRAND_BLUE } };

  const totSkids = bookingsData.reduce((s, b) => s + Number(b.skids || 0), 0);
  const totKg    = bookingsData.reduce((s, b) => s + Number(b.tonnage_kg || 0), 0);
  const approved = bookingsData.filter(b => b.status === 'approved').length;
  const pending  = bookingsData.filter(b => b.status === 'pending').length;
  const cancelled = bookingsData.filter(b => b.status === 'cancelled').length;

  [
    ['Total bookings',     bookingsData.length],
    ['Total skids',        totSkids],
    ['Total tonnage (kg)', totKg.toLocaleString('en-US')],
    ['Approved',           approved],
    ['Pending',            pending],
    ['Cancelled',          cancelled],
  ].forEach(([label, val], i) => {
    ws.getCell(`A${gap + 1 + i}`).value = label;
    ws.getCell(`A${gap + 1 + i}`).font  = { bold: true };
    ws.getCell(`B${gap + 1 + i}`).value = val;
  });

  return workbook;
}

async function generateCapacityExcel(capacityData) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SBU Air Cargo Hub';
  workbook.created = new Date();

  const ws = workbook.addWorksheet('Space Availability', {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { orientation: 'landscape', fitToPage: true }
  });

  ws.columns = [
    { header: 'Airline',          key: 'airline',       width: 18 },
    { header: 'Flight Date',      key: 'flight_date',   width: 14 },
    { header: 'Destination',      key: 'destination',   width: 14 },
    { header: 'Total Skids',      key: 'total_skids',   width: 13 },
    { header: 'Booked Skids',     key: 'booked_skids',  width: 13 },
    { header: 'Free Skids',       key: 'free_skids',    width: 13 },
    { header: 'Total Kg',         key: 'total_kg',      width: 13 },
    { header: 'Booked Kg',        key: 'booked_kg',     width: 13 },
    { header: 'Free Kg',          key: 'free_kg',       width: 13 },
    { header: 'Utilization %',    key: 'utilization',   width: 14 },
    { header: 'Status',           key: 'status',        width: 12 },
    { header: 'PMC Details',      key: 'pmc_details',   width: 22 },
  ];

  applyHeader(ws, BRAND_GREEN);

  capacityData.forEach((c, i) => {
    const totKg    = Number(c.total_kg || 0);
    const bookedKg = Number(c.booked_kg || 0);
    const util     = totKg > 0 ? Math.round((bookedKg / totKg) * 100) : 0;

    const row = ws.addRow({
      airline:      c.airline || '',
      flight_date:  String(c.flight_date || '').slice(0, 10),
      destination:  c.destination || '',
      total_skids:  Number(c.total_skids || 0),
      booked_skids: Number(c.booked_skids || 0),
      free_skids:   Math.max(0, Number(c.total_skids || 0) - Number(c.booked_skids || 0)),
      total_kg:     totKg,
      booked_kg:    bookedKg,
      free_kg:      Math.max(0, totKg - bookedKg),
      utilization:  `${util}%`,
      status:       String(c.status || 'green').toUpperCase(),
      pmc_details:  c.pmc_details || '',
    });

    if (i % 2 === 1) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_ROW_GREEN } };
    }

    // Colour utilisation cell
    const uCell = row.getCell('utilization');
    if (util >= 90) uCell.font = { bold: true, color: { argb: 'FF990000' } };
    else if (util >= 60) uCell.font = { bold: true, color: { argb: 'FF996600' } };
    else uCell.font = { bold: true, color: { argb: 'FF006400' } };

    row.eachCell((cell) => {
      cell.border = ALL_BORDERS;
      if (!cell.alignment) cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    row.height = 20;
  });

  return workbook;
}

module.exports = { generateBookingsExcel, generateCapacityExcel };
