// db.js — Conexión a PostgreSQL
// Reutiliza las mismas variables del .env del proyecto principal

const { Pool } = require("pg");
require("dotenv").config({ path: "../.env" }); // apunta al .env raíz

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

pool.on("connect", () => {
  console.log("[DB] Conectado a PostgreSQL");
});

pool.on("error", (err) => {
  console.error("[DB] Error en el pool:", err.message);
});

module.exports = pool;
