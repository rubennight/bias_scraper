// scripts/crear-admin.js — Crea (o resetea la contraseña de) un
// usuario de login. Pensado para correrse UNA VEZ manualmente en el
// servidor tras aplicar sql/crear_tabla_usuarios.sql — no se ejecuta
// automático desde ningún lado.
//
// Uso — variables de entorno (recomendado, evita que la contraseña
// quede en el historial de la terminal si antepones un espacio al
// comando en bash/zsh con HISTCONTROL=ignorespace):
//   ADMIN_USER=ruben ADMIN_PASSWORD='...' node scripts/crear-admin.js
//
// Uso — interactivo (la contraseña se escribe en texto plano en
// pantalla; hazlo en una terminal privada):
//   node scripts/crear-admin.js
//
// Es un upsert (ON CONFLICT usuario DO UPDATE) — correrlo de nuevo
// con el mismo usuario resetea su contraseña/rol en vez de fallar.

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", "..", ".env") });

const bcrypt = require("bcrypt");
const readline = require("readline");
const pool = require("../db");

function preguntar(rl, texto) {
  return new Promise(resolve => rl.question(texto, resolve));
}

async function main() {
  let usuario = process.env.ADMIN_USER;
  let password = process.env.ADMIN_PASSWORD;
  let rol = process.env.ADMIN_ROL || "admin";

  if (!usuario || !password) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (!usuario)  usuario  = await preguntar(rl, "Usuario: ");
    if (!password) password = await preguntar(rl, "Contraseña (se muestra en texto plano): ");
    if (!["admin", "anotador"].includes(rol)) {
      const r = await preguntar(rl, "Rol [admin/anotador] (default: admin): ");
      if (r.trim()) rol = r.trim();
    }
    rl.close();
  }

  usuario = (usuario || "").trim();
  if (!usuario || !password) {
    console.error("Usuario y contraseña son obligatorios.");
    process.exitCode = 1;
    return;
  }
  if (password.length < 8) {
    console.error("La contraseña debe tener al menos 8 caracteres.");
    process.exitCode = 1;
    return;
  }
  if (!["admin", "anotador"].includes(rol)) {
    console.error(`Rol inválido: "${rol}" (debe ser "admin" o "anotador")`);
    process.exitCode = 1;
    return;
  }

  const hash = await bcrypt.hash(password, 12);

  try {
    const result = await pool.query(
      `INSERT INTO usuarios (usuario, password_hash, rol)
       VALUES ($1, $2, $3)
       ON CONFLICT (usuario) DO UPDATE SET password_hash = EXCLUDED.password_hash, rol = EXCLUDED.rol
       RETURNING id, usuario, rol, creado_en`,
      [usuario, hash, rol]
    );
    console.log("\nListo:");
    console.table(result.rows);
  } catch (err) {
    console.error("Error creando el usuario:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
