const { query } = require("../config/db");

async function exporterPerformance(req, res, next) {
  try {
    const rows = await query(
      `SELECT DATE_FORMAT(b.flight_date, '%x-%v') week,
              SUM(b.tonnage_kg) booked_kg,
              SUM(CASE WHEN uc.confirmer_role = 'airline_analyst' THEN uc.actual_kg ELSE 0 END) airline_confirmed_kg
       FROM bookings b
       LEFT JOIN uplift_confirmations uc ON uc.booking_id = b.id
       WHERE b.exporter_id = ?
       GROUP BY DATE_FORMAT(b.flight_date, '%x-%v')
       ORDER BY week DESC`,
      [req.user.linked_exporter_id]
    );

    return res.json(rows);
  } catch (error) {
    return next(error);
  }
}

async function airlineUtilization(req, res, next) {
  try {
    const rows = await query(
      `SELECT a.name airline, c.flight_date, c.total_kg, c.booked_kg,
              ROUND((c.booked_kg / NULLIF(c.total_kg, 0)) * 100, 2) utilization_percent
       FROM capacities c
       JOIN airlines a ON c.airline_id = a.id
       ORDER BY c.flight_date DESC`
    );
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
}

async function adminOverview(req, res, next) {
  try {
    const [users, bookings, invoices] = await Promise.all([
      query(`SELECT role, COUNT(*) count FROM users GROUP BY role`),
      query(`SELECT status, COUNT(*) count FROM bookings GROUP BY status`),
      query(`SELECT status, COUNT(*) count, SUM(total_amount) total FROM invoices GROUP BY status`)
    ]);

    return res.json({ users, bookings, invoices });
  } catch (error) {
    return next(error);
  }
}

// Used by Admin (and Exporter for their own data) to compare "kg asked" vs "kg used".
// Returns:
//   summary: per-exporter totals (booked vs uplifted, performance %)
//   weekly:  per-exporter weekly bookings vs uplifted
async function exporterPerformanceAnalytics(req, res, next) {
  try {
    const { exporter_id, start_date, end_date } = req.query || {};

    const filters = [];
    const params = [];

    if (req.user.role === "exporter") {
      filters.push("b.exporter_id = ?");
      params.push(req.user.linked_exporter_id);
    } else if (exporter_id) {
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

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const summary = await query(
      `SELECT
         e.id AS exporter_id,
         e.name AS exporter_name,
         COUNT(DISTINCT b.id) AS bookings,
         COALESCE(SUM(b.tonnage_kg), 0) AS asked_kg,
         COALESCE(SUM(CASE WHEN b.status = 'approved' THEN b.tonnage_kg ELSE 0 END), 0) AS approved_kg,
         COALESCE((
           SELECT SUM(uc.actual_kg)
           FROM uplift_confirmations uc
           WHERE uc.confirmer_role = 'airline_supervisor'
             AND uc.booking_id IN (
               SELECT b2.id FROM bookings b2 WHERE b2.exporter_id = e.id
             )
         ), 0) AS used_kg
       FROM exporters e
       LEFT JOIN bookings b ON b.exporter_id = e.id
       ${where}
       GROUP BY e.id, e.name
       HAVING bookings > 0 OR asked_kg > 0
       ORDER BY asked_kg DESC`,
      params
    );

    const summaryWithPerformance = summary.map((row) => {
      const asked = Number(row.asked_kg) || 0;
      const used = Number(row.used_kg) || 0;
      return {
        ...row,
        asked_kg: asked,
        approved_kg: Number(row.approved_kg) || 0,
        used_kg: used,
        performance_pct: asked > 0 ? Math.round((used / asked) * 100) : 0
      };
    });

    const weekly = await query(
      `SELECT
         e.id AS exporter_id,
         e.name AS exporter_name,
         DATE_FORMAT(b.flight_date, '%x-%v') AS week,
         COALESCE(SUM(b.tonnage_kg), 0) AS asked_kg,
         COALESCE(SUM(CASE WHEN b.status = 'approved' THEN b.tonnage_kg ELSE 0 END), 0) AS approved_kg,
         COALESCE((
           SELECT SUM(uc.actual_kg)
           FROM uplift_confirmations uc
           WHERE uc.confirmer_role = 'airline_supervisor'
             AND uc.booking_id IN (
               SELECT b2.id FROM bookings b2
               WHERE b2.exporter_id = e.id
                 AND DATE_FORMAT(b2.flight_date, '%x-%v') = DATE_FORMAT(b.flight_date, '%x-%v')
             )
         ), 0) AS used_kg
       FROM bookings b
       JOIN exporters e ON b.exporter_id = e.id
       ${where}
       GROUP BY e.id, e.name, DATE_FORMAT(b.flight_date, '%x-%v')
       ORDER BY week DESC, e.name ASC`,
      params
    );

    return res.json({
      summary: summaryWithPerformance,
      weekly: weekly.map((row) => {
        const asked = Number(row.asked_kg) || 0;
        const used = Number(row.used_kg) || 0;
        return {
          ...row,
          asked_kg: asked,
          approved_kg: Number(row.approved_kg) || 0,
          used_kg: used,
          performance_pct: asked > 0 ? Math.round((used / asked) * 100) : 0
        };
      })
    });
  } catch (error) {
    return next(error);
  }
}

// Capacity crunch — total airline capacity vs used capacity, daily and weekly buckets.
async function capacityCrunch(req, res, next) {
  try {
    const { airline_id, start_date, end_date } = req.query || {};

    const filters = [];
    const params = [];
    if (airline_id) {
      filters.push("c.airline_id = ?");
      params.push(Number(airline_id));
    }
    if (start_date) {
      filters.push("c.flight_date >= ?");
      params.push(start_date);
    }
    if (end_date) {
      filters.push("c.flight_date <= ?");
      params.push(end_date);
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const daily = await query(
      `SELECT
         c.flight_date AS day,
         a.id AS airline_id,
         a.name AS airline,
         COALESCE(SUM(c.total_kg), 0) AS total_kg,
         COALESCE(SUM(c.booked_kg), 0) AS booked_kg
       FROM capacities c
       JOIN airlines a ON c.airline_id = a.id
       ${where}
       GROUP BY c.flight_date, a.id, a.name
       ORDER BY c.flight_date DESC, a.name ASC
       LIMIT 100`,
      params
    );

    const weekly = await query(
      `SELECT
         DATE_FORMAT(c.flight_date, '%x-%v') AS week,
         a.id AS airline_id,
         a.name AS airline,
         COALESCE(SUM(c.total_kg), 0) AS total_kg,
         COALESCE(SUM(c.booked_kg), 0) AS booked_kg
       FROM capacities c
       JOIN airlines a ON c.airline_id = a.id
       ${where}
       GROUP BY DATE_FORMAT(c.flight_date, '%x-%v'), a.id, a.name
       ORDER BY week DESC, a.name ASC
       LIMIT 100`,
      params
    );

    const annotate = (rows) => rows.map((row) => {
      const total = Number(row.total_kg) || 0;
      const booked = Number(row.booked_kg) || 0;
      const free = Math.max(0, total - booked);
      const utilization_pct = total > 0 ? Math.round((booked / total) * 100) : 0;
      const crunch_level = utilization_pct >= 95 ? "critical" : utilization_pct >= 80 ? "tight" : "healthy";
      return { ...row, total_kg: total, booked_kg: booked, free_kg: free, utilization_pct, crunch_level };
    });

    return res.json({ daily: annotate(daily), weekly: annotate(weekly) });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  exporterPerformance,
  airlineUtilization,
  adminOverview,
  exporterPerformanceAnalytics,
  capacityCrunch
};
