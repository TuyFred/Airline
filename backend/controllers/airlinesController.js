const { query } = require("../config/db");

async function fetchDestinationsByAirline() {
  const rows = await query(
    `SELECT airline_id, destination, is_transit FROM airline_destinations ORDER BY destination ASC`
  );
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.airline_id)) map.set(row.airline_id, []);
    map.get(row.airline_id).push({ destination: row.destination, is_transit: !!row.is_transit });
  }
  return map;
}

function parseDestinations(input) {
  if (Array.isArray(input)) {
    return input
      .map((item) => {
        if (typeof item === "string") return { destination: item.trim(), is_transit: 0 };
        if (item && typeof item === "object" && item.destination) {
          return { destination: String(item.destination).trim(), is_transit: item.is_transit ? 1 : 0 };
        }
        return null;
      })
      .filter((d) => d && d.destination);
  }
  if (typeof input === "string") {
    return input
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((destination) => ({ destination, is_transit: 0 }));
  }
  return [];
}

async function syncDestinations(airlineId, destinations) {
  await query(`DELETE FROM airline_destinations WHERE airline_id = ?`, [airlineId]);
  if (!destinations.length) return;
  const seen = new Set();
  for (const item of destinations) {
    const key = item.destination.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      await query(
        `INSERT INTO airline_destinations (airline_id, destination, is_transit) VALUES (?, ?, ?)`,
        [airlineId, item.destination, item.is_transit ? 1 : 0]
      );
    } catch {
      /* ignore duplicates */
    }
  }
}

async function listAirlines(req, res, next) {
  try {
    const rows = await query(
      `SELECT a.id, a.name, a.code, a.from_destination, a.created_at,
              COUNT(c.id) AS capacity_count,
              MAX(c.flight_date) AS latest_capacity_date
       FROM airlines a
       LEFT JOIN capacities c ON c.airline_id = a.id
       GROUP BY a.id, a.name, a.code, a.from_destination, a.created_at
       ORDER BY a.name ASC`
    );

    const destinationsMap = await fetchDestinationsByAirline();
    const enriched = rows.map((row) => ({
      ...row,
      destinations: destinationsMap.get(row.id) || []
    }));
    return res.json(enriched);
  } catch (error) {
    return next(error);
  }
}

async function createAirline(req, res, next) {
  try {
    const { name, code, from_destination, destinations } = req.body;
    if (!String(name || "").trim()) {
      return res.status(400).json({ message: "Airline name is required" });
    }

    const existing = await query(`SELECT id FROM airlines WHERE LOWER(name) = LOWER(?) LIMIT 1`, [name.trim()]);
    if (existing.length) {
      return res.status(409).json({ message: "Airline already exists" });
    }

    const result = await query(
      `INSERT INTO airlines (name, code, from_destination) VALUES (?, ?, ?)`,
      [
        name.trim(),
        String(code || "").trim() || null,
        String(from_destination || "").trim() || null
      ]
    );

    const parsed = parseDestinations(destinations);
    if (parsed.length) {
      await syncDestinations(result.insertId, parsed);
    }

    return res.status(201).json({ message: "Airline created", id: result.insertId });
  } catch (error) {
    return next(error);
  }
}

async function updateAirline(req, res, next) {
  try {
    const { id } = req.params;
    const { name, code, from_destination, destinations } = req.body;

    const rows = await query(`SELECT id FROM airlines WHERE id = ? LIMIT 1`, [id]);
    if (!rows.length) {
      return res.status(404).json({ message: "Airline not found" });
    }

    if (!String(name || "").trim()) {
      return res.status(400).json({ message: "Airline name is required" });
    }

    const conflict = await query(
      `SELECT id FROM airlines WHERE LOWER(name) = LOWER(?) AND id <> ? LIMIT 1`,
      [name.trim(), id]
    );
    if (conflict.length) {
      return res.status(409).json({ message: "Another airline already uses this name" });
    }

    await query(
      `UPDATE airlines SET name = ?, code = ?, from_destination = ? WHERE id = ?`,
      [
        name.trim(),
        String(code || "").trim() || null,
        String(from_destination || "").trim() || null,
        id
      ]
    );

    if (destinations !== undefined) {
      await syncDestinations(id, parseDestinations(destinations));
    }

    return res.json({ message: "Airline updated" });
  } catch (error) {
    return next(error);
  }
}

async function deleteAirline(req, res, next) {
  try {
    const { id } = req.params;
    const rows = await query(`SELECT id, name FROM airlines WHERE id = ? LIMIT 1`, [id]);
    if (!rows.length) {
      return res.status(404).json({ message: "Airline not found" });
    }

    await query(`DELETE FROM airlines WHERE id = ?`, [id]);
    return res.json({ message: "Airline deleted" });
  } catch (error) {
    return next(error);
  }
}

module.exports = { listAirlines, createAirline, updateAirline, deleteAirline };
