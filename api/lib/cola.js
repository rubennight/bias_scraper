// lib/cola.js — Cola de oraciones para anotar.
//
// Orden de entrega para un anotador:
//   1. Las oraciones pendientes del bloque compartido (bloque_compartido),
//      en su orden fijo: son las mismas para todos y con ellas se calcula
//      el Kappa entre anotadores.
//   2. Después, oraciones al azar por oración. El orden es estable para
//      cada anotador (MD5 de oración + anotador) y distinto entre
//      anotadores; se prefieren las que nadie más ha anotado, para no
//      repetir trabajo fuera del bloque.
// Siempre se excluyen las oraciones compleja/descartada y las que ese
// anotador ya anotó (versión 1).
//
// `db` es cualquier objeto con .query (un Pool o un client de pg).

const ELEGIBLE = `
  (o.compleja IS NULL OR o.compleja = FALSE)
  AND (o.descartada IS NULL OR o.descartada = FALSE)`;

async function obtenerCola(db, anotadorId, limite) {
  const r = await db.query(`
    SELECT
      o.id,
      o.texto,
      o.contexto_prev,
      o.contexto_sig,
      o.posicion,
      o.num_palabras,
      a.id          AS articulo_id,
      a.titular     AS titular_articulo,
      f.nombre      AS fuente,
      f.orientacion,
      ev.id         AS evento_id,
      ev.titular_evento,
      ev.resumen,
      (b.oracion_id IS NOT NULL) AS en_bloque
    FROM oraciones o
    JOIN articulos a  ON a.id  = o.articulo_id
    JOIN fuentes   f  ON f.id  = a.fuente_id
    JOIN eventos   ev ON ev.id = a.evento_id
    LEFT JOIN bloque_compartido b ON b.oracion_id = o.id
    WHERE NOT EXISTS (
        SELECT 1 FROM anotaciones x
        WHERE x.oracion_id = o.id AND x.anotador_id = $1 AND x.version = 1
      )
      AND ${ELEGIBLE}
    ORDER BY
      (b.oracion_id IS NULL),
      b.orden,
      EXISTS (
        SELECT 1 FROM anotaciones y
        WHERE y.oracion_id = o.id AND y.anotador_id <> $1 AND y.version = 1
      ),
      MD5(o.id::text || $1::text)
    LIMIT $2
  `, [anotadorId, limite]);
  return r.rows;
}

// Avance del anotador en el bloque. `total` descuenta las oraciones del
// bloque marcadas compleja/descartada: la cola ya no las entrega, así que
// contarlas haría imposible llegar a hechas === total.
async function progresoBloque(db, anotadorId) {
  const r = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE ${ELEGIBLE})::int AS total,
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM anotaciones x
        WHERE x.oracion_id = o.id AND x.anotador_id = $1 AND x.version = 1
      ))::int AS hechas
    FROM bloque_compartido b
    JOIN oraciones o ON o.id = b.oracion_id
  `, [anotadorId]);
  return { hechas: r.rows[0].hechas, total: r.rows[0].total };
}

module.exports = { obtenerCola, progresoBloque };
