const { query } = require("../config/db");
const { computeStatus } = require("../utils/capacity");
const { emitCapacityUpdate } = require("../config/socket");

async function listCapacity(req, res, next) {
  try {
    const rows = await query(
      `SELECT c.*, a.name AS airline,
              CASE WHEN DATE(c.flight_date) < CURRENT_DATE() THEN 1 ELSE 0 END AS is_closed,
              CASE WHEN DATE(c.flight_date) < CURRENT_DATE() THEN 'closed' ELSE c.status END AS availability_state
       FROM capacities c
       JOIN airlines a ON c.airline_id = a.id
       ORDER BY c.flight_date ASC, a.name ASC`
    );
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
}

async function upsertCapacity(req, res, next) {
  try {
    const { airline_id, flight_date, destination, total_skids, total_kg, pmc_details, is_draft } = req.body;
    const draft = Boolean(is_draft);
    const existing = await query(
      `SELECT id, booked_kg FROM capacities WHERE airline_id = ? AND flight_date = ? AND destination = ? LIMIT 1`,
      [airline_id, flight_date, destination]
    );

    if (existing.length) {
      const cap = existing[0];
      const status = draft
        ? "draft"
        : computeStatus(Number(total_kg) - Number(cap.booked_kg), Number(total_kg));
      await query(
        `UPDATE capacities SET total_skids = ?, total_kg = ?, pmc_details = ?, status = ?, updated_at = NOW() WHERE id = ?`,
        [total_skids, total_kg, pmc_details || null, status, cap.id]
      );
      emitCapacityUpdate({ id: cap.id, total_skids, total_kg, status });
      return res.json({ message: draft ? "Capacity saved as draft" : "Capacity updated", id: cap.id, status });
    }

    const status = draft
      ? "draft"
      : computeStatus(Number(total_kg), Number(total_kg));
    const result = await query(
      `INSERT INTO capacities (airline_id, flight_date, destination, total_skids, total_kg, booked_skids, booked_kg, pmc_details, status)
       VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`,
      [airline_id, flight_date, destination, total_skids, total_kg, pmc_details || null, status]
    );

    emitCapacityUpdate({
      id: result.insertId,
      airline_id,
      flight_date,
      destination,
      total_skids,
      total_kg,
      booked_skids: 0,
      booked_kg: 0,
      status
    });

    return res.status(201).json({ message: draft ? "Capacity saved as draft" : "Capacity created", id: result.insertId, status });
  } catch (error) {
    return next(error);
  }
}

async function releaseCapacity(req, res, next) {
  try {
    const { capacity_id, reduced_skids, reduced_kg } = req.body;
    const rows = await query(`SELECT * FROM capacities WHERE id = ? LIMIT 1`, [capacity_id]);
    if (!rows.length) return res.status(404).json({ message: "Capacity record not found" });

    const c = rows[0];
    const bookedSkids = Math.max(0, Number(c.booked_skids) - Number(reduced_skids || 0));
    const bookedKg = Math.max(0, Number(c.booked_kg) - Number(reduced_kg || 0));
    const status = computeStatus(Number(c.total_kg) - bookedKg, Number(c.total_kg));

    await query(
      `UPDATE capacities SET booked_skids = ?, booked_kg = ?, status = ?, updated_at = NOW() WHERE id = ?`,
      [bookedSkids, bookedKg, status, c.id]
    );

    emitCapacityUpdate({ id: c.id, booked_skids: bookedSkids, booked_kg: bookedKg, status });
    return res.json({ message: "Released back to public pool" });
  } catch (error) {
    return next(error);
  }
}

async function deleteCapacity(req, res, next) {
  try {
    const { id } = req.params;
    const rows = await query(`SELECT id FROM capacities WHERE id = ? LIMIT 1`, [id]);
    if (!rows.length) {
      return res.status(404).json({ message: "Capacity record not found" });
    }

    await query(`DELETE FROM capacities WHERE id = ?`, [id]);
    return res.json({ message: "Capacity record deleted" });
  } catch (error) {
    return next(error);
  }
}

module.exports = { listCapacity, upsertCapacity, releaseCapacity, deleteCapacity };
