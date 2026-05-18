const { query } = require("../config/db");

/**
 * @param {number} exporterId
 * @returns {Promise<{ pricePerKg: number, pricePerAwb: number | null, model: 'per_kg' | 'per_awb' }>}
 */
async function getExporterPricingConfig(exporterId) {
  const rows = await query(
    `SELECT price_per_kg, price_per_awb, pricing_model
     FROM exporter_pricing
     WHERE exporter_id = ?
     LIMIT 1`,
    [exporterId]
  );

  const defaults = { pricePerKg: 5.0, pricePerAwb: null, model: "per_kg" };
  if (!rows.length) return defaults;

  const r = rows[0];
  const pricePerKg = Number(r.price_per_kg);
  const pricePerAwb = r.price_per_awb == null || r.price_per_awb === "" ? null : Number(r.price_per_awb);
  const rawModel = String(r.pricing_model || "per_kg").toLowerCase();
  const model = rawModel === "per_awb" ? "per_awb" : "per_kg";

  return {
    pricePerKg: Number.isFinite(pricePerKg) && pricePerKg > 0 ? pricePerKg : 5.0,
    pricePerAwb: Number.isFinite(pricePerAwb) && pricePerAwb >= 0 ? pricePerAwb : null,
    model
  };
}

/** @deprecated use getExporterPricingConfig for new code */
async function getExporterPriceForBilling(exporterId) {
  const c = await getExporterPricingConfig(exporterId);
  return c.pricePerKg;
}

/**
 * Distinct non-empty AWB numbers on uplift notifications for a booking.
 * @param {number} bookingId
 */
async function countBillableAwbs(bookingId) {
  const rows = await query(
    `SELECT DISTINCT TRIM(awb_number) AS awb
     FROM uplift_notifications
     WHERE booking_id = ? AND awb_number IS NOT NULL AND TRIM(awb_number) <> ''`,
    [bookingId]
  );
  const list = rows.map((r) => String(r.awb || "").trim()).filter(Boolean);
  const n = list.length;
  return { awbs: list, count: n > 0 ? n : 1 };
}

module.exports = { getExporterPricingConfig, getExporterPriceForBilling, countBillableAwbs };
