// db.js — Conexión a PostgreSQL
// Reutiliza las mismas variables del .env del proyecto principal.
// En Docker no existe archivo .env — las variables (DB_HOST, etc.)
// ya vienen inyectadas por docker-compose.yml como env vars reales
// del contenedor. dotenv.config() no lanza excepción si el archivo
// no existe (solo devuelve un error en el resultado), así que esto
// no rompe el arranque en ninguno de los dos entornos.

const { Pool } = require("pg");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

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
