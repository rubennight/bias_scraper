// Pruebas de la cola de anotación contra la BD local (solo lectura; las
// que modifican oraciones lo hacen dentro de una transacción que se
// revierte). Se omiten si no hay conexión a la BD.

const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../db");
const { obtenerCola, progresoBloque } = require("./cola");

const NUEVO_A = 999998; // anotadores inexistentes: sin anotaciones previas
const NUEVO_B = 999999;

let hayBD = true;
test.before(async () => {
  try { await pool.query("SELECT 1"); } catch { hayBD = false; }
});
test.after(() => pool.end());

const ids = filas => filas.map(f => f.id);

test("las primeras 100 son el bloque, iguales para dos anotadores", async t => {
  if (!hayBD) return t.skip("sin BD");
  const a = await obtenerCola(pool, NUEVO_A, 150);
  const b = await obtenerCola(pool, NUEVO_B, 150);
  assert.ok(a.slice(0, 100).every(f => f.en_bloque === true));
  assert.deepEqual(ids(a.slice(0, 100)), ids(b.slice(0, 100)));
  assert.ok(a.slice(100).every(f => f.en_bloque === false));
});

test("después del bloque el orden difiere entre anotadores", async t => {
  if (!hayBD) return t.skip("sin BD");
  const a = await obtenerCola(pool, NUEVO_A, 150);
  const b = await obtenerCola(pool, NUEVO_B, 150);
  assert.notDeepEqual(ids(a.slice(100)), ids(b.slice(100)));
});

test("el orden de un anotador es estable entre llamadas", async t => {
  if (!hayBD) return t.skip("sin BD");
  const a1 = await obtenerCola(pool, NUEVO_A, 150);
  const a2 = await obtenerCola(pool, NUEVO_A, 150);
  assert.deepEqual(ids(a1), ids(a2));
});

test("no hay ids repetidos y se respeta el límite", async t => {
  if (!hayBD) return t.skip("sin BD");
  const a = await obtenerCola(pool, NUEVO_A, 120);
  assert.equal(a.length, 120);
  assert.equal(new Set(ids(a)).size, 120);
});

test("excluye lo ya anotado por ese anotador", async t => {
  if (!hayBD) return t.skip("sin BD");
  const hechas = await pool.query("SELECT oracion_id FROM anotaciones WHERE anotador_id = 1 AND version = 1");
  const ya = new Set(hechas.rows.map(r => r.oracion_id));
  assert.ok(ya.size > 0);
  const cola = await obtenerCola(pool, 1, 500);
  assert.ok(cola.every(f => !ya.has(f.id)));
});

test("después del bloque prefiere oraciones que nadie más anotó", async t => {
  if (!hayBD) return t.skip("sin BD");
  const otras = await pool.query("SELECT DISTINCT oracion_id FROM anotaciones WHERE anotador_id <> $1 AND version = 1", [NUEVO_A]);
  const deOtros = new Set(otras.rows.map(r => r.oracion_id));
  const cola = await obtenerCola(pool, NUEVO_A, 300);
  assert.ok(cola.filter(f => !f.en_bloque).every(f => !deOtros.has(f.id)));
});

test("no entrega oraciones compleja o descartada, tampoco las del bloque", async t => {
  if (!hayBD) return t.skip("sin BD");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const antes = await obtenerCola(client, NUEVO_A, 100);
    const [c, d] = [antes[0].id, antes[1].id];
    await client.query("UPDATE oraciones SET compleja = TRUE WHERE id = $1", [c]);
    await client.query("UPDATE oraciones SET descartada = TRUE WHERE id = $1", [d]);
    const despues = await obtenerCola(client, NUEVO_A, 100);
    assert.ok(!ids(despues).includes(c));
    assert.ok(!ids(despues).includes(d));
    // El bloque se encoge a 98 y el resto del límite se completa con oraciones normales
    assert.equal(despues.filter(f => f.en_bloque).length, 98);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

test("cada fila trae el resumen del evento", async t => {
  if (!hayBD) return t.skip("sin BD");
  const cola = await obtenerCola(pool, NUEVO_A, 100);
  assert.ok(cola.every(f => "resumen" in f && "titular_evento" in f));
  assert.ok(cola.filter(f => typeof f.resumen === "string" && f.resumen.length > 0).length >= 90);
});

test("progresoBloque: un anotador nuevo tiene 0 hechas", async t => {
  if (!hayBD) return t.skip("sin BD");
  const p = await progresoBloque(pool, NUEVO_A);
  assert.deepEqual(p, { hechas: 0, total: 100 });
});

test("progresoBloque: el total descuenta las del bloque marcadas compleja", async t => {
  if (!hayBD) return t.skip("sin BD");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const [{ id }] = await obtenerCola(client, NUEVO_A, 1);
    await client.query("UPDATE oraciones SET compleja = TRUE WHERE id = $1", [id]);
    const p = await progresoBloque(client, NUEVO_A);
    assert.equal(p.total, 99);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
