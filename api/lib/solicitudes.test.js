// Pruebas de crearSolicitud contra la BD local. Todo ocurre dentro de una
// transacción que se revierte. Se omiten si no hay conexión a la BD.

const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../db");
const { crearSolicitud } = require("./solicitudes");

let hayBD = true;
let client;
test.before(async () => {
  try { client = await pool.connect(); await client.query("BEGIN"); } catch { hayBD = false; }
});
test.after(async () => {
  if (client) { await client.query("ROLLBACK"); client.release(); }
  await pool.end();
});

const EMAIL = "zz.prueba.solicitud@example.com";
const datos = (extra = {}) => ({
  nombre_completo: "Prueba Uno", email: EMAIL, celular: "4921234567", hash: "hash-1", ...extra,
});
const filas = async () =>
  (await client.query("SELECT * FROM usuarios WHERE lower(email) = $1", [EMAIL])).rows;

test("una solicitud nueva queda pendiente con rol anotador", async t => {
  if (!hayBD) return t.skip("sin BD");
  await crearSolicitud(client, datos());
  const [f] = await filas();
  assert.equal(f.estado, "pendiente");
  assert.equal(f.rol, "anotador");
  assert.equal(f.usuario, EMAIL);
});

test("registrar de nuevo el mismo email no crea una segunda fila", async t => {
  if (!hayBD) return t.skip("sin BD");
  // validarRegistro ya pasa el email a minúsculas antes de llegar aquí
  await crearSolicitud(client, datos({ nombre_completo: "Otra Persona", hash: "hash-2" }));
  const r = await filas();
  assert.equal(r.length, 1);
  assert.equal(r[0].nombre_completo, "Prueba Uno");
});

test("una solicitud pendiente no se sobrescribe", async t => {
  if (!hayBD) return t.skip("sin BD");
  await crearSolicitud(client, datos({ nombre_completo: "Intruso", hash: "hash-3" }));
  const [f] = await filas();
  assert.equal(f.nombre_completo, "Prueba Uno");
  assert.equal(f.password_hash, "hash-1");
});

test("una solicitud rechazada se puede volver a registrar y queda pendiente con los datos nuevos", async t => {
  if (!hayBD) return t.skip("sin BD");
  await client.query(
    "UPDATE usuarios SET estado = 'rechazado', motivo_rechazo = 'no es del equipo' WHERE lower(email) = $1", [EMAIL]);
  await crearSolicitud(client, datos({ nombre_completo: "Dueño Real", celular: "4929998888", hash: "hash-4" }));
  const [f] = await filas();
  assert.equal(f.estado, "pendiente");
  assert.equal(f.nombre_completo, "Dueño Real");
  assert.equal(f.celular, "4929998888");
  assert.equal(f.password_hash, "hash-4");
  assert.equal(f.motivo_rechazo, null);
});

test("una cuenta aprobada nunca se sobrescribe", async t => {
  if (!hayBD) return t.skip("sin BD");
  await client.query("UPDATE usuarios SET estado = 'aprobado' WHERE lower(email) = $1", [EMAIL]);
  await crearSolicitud(client, datos({ nombre_completo: "Suplantador", hash: "hash-5" }));
  const [f] = await filas();
  assert.equal(f.estado, "aprobado");
  assert.equal(f.password_hash, "hash-4");
});
