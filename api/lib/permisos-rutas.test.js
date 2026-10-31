// Las rutas que exponen o alteran datos de TODOS los anotadores deben
// rechazar a un anotador que no es admin. Se monta el router real con una
// sesión falsa; las pruebas de rechazo no llegan a tocar la BD.

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const pool = require("../db");
const anotacion = require("../routes/anotacion");

function servidor(rol) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.usuario = { id: 1, rol }; next(); });
  app.use("/", anotacion);
  return new Promise(resolve => { const s = app.listen(0, () => resolve(s)); });
}

async function pedir(s, metodo, ruta, cuerpo) {
  const res = await fetch(`http://127.0.0.1:${s.address().port}${ruta}`, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return res.status;
}

let s;
test.before(async () => { s = await servidor("anotador"); });
test.after(async () => { s.close(); await pool.end(); });

test("un anotador no puede calcular el Kappa (revela cómo clasificó otro)", async () => {
  assert.equal(await pedir(s, "GET", "/kappa?anotador1_id=1&anotador2_id=1"), 403);
});

test("un anotador no puede leer el lexicón de todos los anotadores", async () => {
  assert.equal(await pedir(s, "GET", "/lexicon"), 403);
});

test("un anotador no puede quitar la marca compleja de una oración", async () => {
  assert.equal(await pedir(s, "PUT", "/oraciones/1/compleja", { compleja: false }), 403);
});

test("un anotador no puede quitar la marca de descartada de una oración", async () => {
  assert.equal(await pedir(s, "PUT", "/oraciones/1/descartada", { descartada: false }), 403);
});
