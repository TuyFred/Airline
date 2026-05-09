const dayjs = require("dayjs");
const { INVOICE_SETTINGS } = require("../config/constants");

function generateInvoiceNumber(prefix = "INV") {
  return `${prefix}-${dayjs().format("YYYYMMDD")}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function calculateNoShowCharge(committedKg) {
  const chargeableKg = committedKg * INVOICE_SETTINGS.NO_SHOW_PERCENT;
  const amount = chargeableKg * INVOICE_SETTINGS.DEFAULT_PRICE_PER_KG;
  return { chargeableKg, amount };
}

module.exports = { generateInvoiceNumber, calculateNoShowCharge };
