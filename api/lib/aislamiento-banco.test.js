// El Banco no debe mostrar a un anotador las clasificaciones de otros sobre
// el bloque compartido. Se prueba la condición SQL contra la BD local, con
// anotaciones temporales dentro de una transacción que se revierte.

const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../db");
const { condicionAislamiento } = require("./banco");

let hayBD = true;
let client, bloque, fuera, yo, otro;

test.before(async () => {
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    yo   = (await client.query("INSERT INTO anotadores (nombre) VALUES ('zz-aislamiento-yo') RETURNING id")).rows[0].id;
    otro = (await client.query("INSERT INTO anotadores (nombre) VALUES ('zz-aislamiento-otro') RETURNING id")).rows[0].id;
    bloque = (await client.query("SELECT oracion_id FROM bloque_compartido ORDER BY orden LIMIT 1")).rows[0].oracion_id;
    fuera  = (await client.query(
      "SELECT id FROM oraciones WHERE id NOT IN (SELECT oracion_id FROM bloque_compartido) ORDER BY id LIMIT 1")).rows[0].id;
    // yo y otro anotan la del bloque; otro anota también una fuera del bloque
    for (const [oid, quien] of [[bloque, yo], [bloque, otro], [fuera, otro]]) {
      await client.query(
        "INSERT INTO anotaciones (oracion_id, anotador_id, version, categoria) VALUES ($1, $2, 1, 'A')", [oid, quien]);
    }
  } catch { hayBD = false; }
});
test.after(async () => {
  if (client) { await client.query("ROLLBACK"); client.release(); }
  await pool.end();
});

// "oracion:anotador" de las anotaciones de prueba que ve (rol, anotadorId)
async function visibles(rol, anotadorId) {
  const params = [[bloque, fuera]];
  const cond = condicionAislamiento(rol, anotadorId, params);
  const r = await client.query(
    `SELECT an.oracion_id, an.anotador_id FROM anotaciones an
     WHERE an.version = 1 AND an.oracion_id = ANY($1) AND an.anotador_id IN (${yo}, ${otro})
     ${cond ? "AND " + cond : ""}`,
    params);
  return r.rows.map(x => `${x.oracion_id}:${x.anotador_id}`);
}

test("el admin no tiene condición: ve todas las anotaciones", async t => {
  if (!hayBD) return t.skip("sin BD");
  assert.equal(condicionAislamiento("admin", null, []), null);
  assert.equal((await visibles("admin", null)).length, 3);
});

test("un anotador ve las propias del bloque y no las ajenas del bloque", async t => {
  if (!hayBD) return t.skip("sin BD");
  const v = await visibles("anotador", yo);
  assert.ok(v.includes(`${bloque}:${yo}`));
  assert.ok(!v.includes(`${bloque}:${otro}`));
});

test("un anotador sí ve las anotaciones ajenas de oraciones fuera del bloque", async t => {
  if (!hayBD) return t.skip("sin BD");
  const v = await visibles("anotador", yo);
  assert.ok(v.includes(`${fuera}:${otro}`));
});
