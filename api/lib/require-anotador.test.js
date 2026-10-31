const test = require("node:test");
const assert = require("node:assert/strict");
const { crearRequireAnotador } = require("../middleware/auth");

// Ejecuta el middleware con una "BD" falsa que devuelve la fila indicada
async function ejecutar(fila) {
  const db = { query: async () => ({ rows: fila ? [fila] : [] }) };
  const req = { usuario: { id: 7 } };
  const res = {
    codigo: null, cuerpo: null,
    status(c) { this.codigo = c; return this; },
    json(b) { this.cuerpo = b; return this; },
  };
  let siguio = false;
  await crearRequireAnotador(db)(req, res, () => { siguio = true; });
  return { req, res, siguio };
}

test("cuenta sin perfil de anotador recibe 403 con mensaje claro, no un 500", async () => {
  const { res, siguio } = await ejecutar({ anotador_id: null, estado: "aprobado" });
  assert.equal(res.codigo, 403);
  assert.equal(res.cuerpo.error, "Tu cuenta no tiene perfil de anotador");
  assert.equal(siguio, false);
});

test("cuenta que ya no está aprobada recibe 403", async () => {
  const { res, siguio } = await ejecutar({ anotador_id: 3, estado: "rechazado" });
  assert.equal(res.codigo, 403);
  assert.equal(siguio, false);
});

test("usuario que ya no existe recibe 403", async () => {
  const { res } = await ejecutar(null);
  assert.equal(res.codigo, 403);
});

test("cuenta aprobada con perfil continúa y deja el perfil en req.anotadorId", async () => {
  const { req, siguio } = await ejecutar({ anotador_id: 3, estado: "aprobado" });
  assert.equal(siguio, true);
  assert.equal(req.anotadorId, 3);
});
