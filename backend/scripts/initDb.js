require("dotenv").config();

const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");
const { AIRLINES } = require("../config/constants");

async function init() {
  const adminName = process.env.ADMIN_FULL_NAME || "System Admin";
  const adminEmail = process.env.ADMIN_EMAIL || "";
  const adminPassword = process.env.ADMIN_PASSWORD || "";

  const root = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    multipleStatements: true
  });

  const schemaPath = path.join(__dirname, "..", "models", "schema.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf8");
  await root.query(schemaSql);

  const db = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "sbu_export_hub"
  });

  const [airlineRows] = await db.query("SELECT COUNT(*) count FROM airlines");
  if (!airlineRows[0].count) {
    for (const name of AIRLINES) {
      await db.query("INSERT INTO airlines (name, code) VALUES (?, ?)", [name, name.slice(0, 3).toUpperCase()]);
    }
  }

  const [exporterRows] = await db.query("SELECT id FROM exporters WHERE contact_email = ? LIMIT 1", ["exporter@test.sbu"]);
  let exporterId;
  if (!exporterRows.length) {
    const [result] = await db.query("INSERT INTO exporters (name, contact_email) VALUES (?, ?)", ["Souk Farms", "exporter@test.sbu"]);
    exporterId = result.insertId;
  } else {
    exporterId = exporterRows[0].id;
  }

  const users = [
    {
      full_name: "Demo Exporter",
      email: "exporter@test.sbu",
      password: "Exporter@123",
      role: "exporter",
      linked_exporter_id: exporterId,
      linked_airline: null
    },
    {
      full_name: "Demo Airline Analyst",
      email: "analyst@test.sbu",
      password: "Analyst@123",
      role: "airline_analyst",
      linked_exporter_id: null,
      linked_airline: "RwandAir"
    },
    {
      full_name: "Demo Clearing Agent",
      email: "agent@test.sbu",
      password: "Agent@123",
      role: "clearing_agent",
      linked_exporter_id: exporterId,
      linked_airline: null
    }
  ];

  for (const user of users) {
    const [exists] = await db.query("SELECT id FROM users WHERE email = ? LIMIT 1", [user.email]);
    if (exists.length) continue;

    const hash = await bcrypt.hash(user.password, 10);
    await db.query(
      `INSERT INTO users (full_name, email, password_hash, role, linked_exporter_id, linked_airline)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [user.full_name, user.email, hash, user.role, user.linked_exporter_id, user.linked_airline]
    );
  }

  if (adminEmail && adminPassword) {
    const [adminByEmail] = await db.query("SELECT id FROM users WHERE email = ? LIMIT 1", [adminEmail]);
    const adminHash = await bcrypt.hash(adminPassword, 10);

    if (!adminByEmail.length) {
      await db.query(
        `INSERT INTO users (full_name, email, password_hash, role, linked_exporter_id, linked_airline)
         VALUES (?, ?, ?, 'admin', NULL, NULL)`,
        [adminName, adminEmail, adminHash]
      );
    } else {
      await db.query(
        `UPDATE users SET full_name = ?, password_hash = ?, role = 'admin' WHERE id = ?`,
        [adminName, adminHash, adminByEmail[0].id]
      );
    }
  } else {
    console.log("Admin seed skipped in initDb: set ADMIN_EMAIL and ADMIN_PASSWORD in .env");
  }

  const [capRows] = await db.query("SELECT COUNT(*) count FROM capacities");
  if (!capRows[0].count) {
    const [rwandAir] = await db.query("SELECT id FROM airlines WHERE name = 'RwandAir' LIMIT 1");
    const [ethiopian] = await db.query("SELECT id FROM airlines WHERE name = 'Ethiopian' LIMIT 1");

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const date = `${yyyy}-${mm}-${dd}`;

    await db.query(
      `INSERT INTO capacities (airline_id, flight_date, destination, total_skids, total_kg, status)
       VALUES (?, ?, 'AMS', 30, 12000, 'green'), (?, ?, 'BRU', 28, 11000, 'green')`,
      [rwandAir[0].id, date, ethiopian[0].id, date]
    );
  }

  console.log("Database initialized with schema and seed data.");
  console.log("Test users:");
  if (adminEmail) {
    console.log(`${adminEmail} / [admin password from .env]`);
  }
  console.log("exporter@test.sbu / Exporter@123");
  console.log("analyst@test.sbu / Analyst@123");
  console.log("agent@test.sbu / Agent@123");

  await db.end();
  await root.end();
}

init().catch((error) => {
  console.error(error);
  process.exit(1);
});
