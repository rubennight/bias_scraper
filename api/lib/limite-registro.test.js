// Los intentos de registro con datos inválidos no deben gastar el cupo de
// registros por IP: detrás de un proxy todos comparten IP y un solo error
// de dedo bloquearía a todo el equipo. No toca la BD (la validación falla
// antes de cualquier consulta).

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const pool = require("../db");
const auth = require("../routes/auth");

let s;
test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/", auth);
  s = await new Promise(resolve => { const srv = app.listen(0, () => resolve(srv)); });
});
test.after(async () => { s.close(); await pool.end(); });

test("siete registros inválidos seguidos siguen respondiendo 400, no 429", async () => {
  const estados = [];
  for (let i = 0; i < 7; i++) {
    const res = await fetch(`http://127.0.0.1:${s.address().port}/registro`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre_completo: "x", email: "x", celular: "1", password: "1" }),
    });
    estados.push(res.status);
  }
  assert.deepEqual(estados, [400, 400, 400, 400, 400, 400, 400]);
});
