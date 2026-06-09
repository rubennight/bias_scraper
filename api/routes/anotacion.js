// anotacion.js — Endpoints para la Fase 4: Anotación A/B/C

const router = require("express").Router();
const pool   = require("../db");

// ── GET /api/anotacion/anotadores ────────────────────────────
router.get("/anotadores", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.id, a.nombre, a.descripcion, a.creado_en,
             COUNT(an.id) AS total_anotaciones
      FROM anotadores a
      LEFT JOIN anotaciones an ON an.anotador_id = a.id AND an.version = 1
      GROUP BY a.id ORDER BY a.id
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/anotacion/anotadores ───────────────────────────
router.post("/anotadores", async (req, res) => {
  try {
    const { nombre, descripcion } = req.body;
    if (!nombre?.trim())
      return res.status(400).json({ error: "El nombre es obligatorio" });
    const result = await pool.query(`
      INSERT INTO anotadores (nombre, descripcion) VALUES ($1, $2)
      ON CONFLICT (nombre) DO UPDATE SET descripcion = EXCLUDED.descripcion
      RETURNING id, nombre, descripcion, creado_en
    `, [nombre.trim(), descripcion?.trim() || ""]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/anotacion/oraciones ─────────────────────────────
// Retorna oraciones pendientes para un anotador.
// Orden: aleatorio entre artículos (usando MD5 estable),
//        secuencial dentro de cada artículo (por posición).
router.get("/oraciones", async (req, res) => {
  try {
    const { anotador_id, limite = 50 } = req.query;
    if (!anotador_id)
      return res.status(400).json({ error: "anotador_id requerido" });

    const result = await pool.query(`
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
        ev.titular_evento
      FROM oraciones o
      JOIN articulos a  ON a.id  = o.articulo_id
      JOIN fuentes   f  ON f.id  = a.fuente_id
      JOIN eventos   ev ON ev.id = a.evento_id
      WHERE o.id NOT IN (
        SELECT oracion_id FROM anotaciones
        WHERE anotador_id = $1 AND version = 1
      )
      AND (o.compleja IS NULL OR o.compleja = FALSE)
      ORDER BY MD5(a.id::text), o.posicion
      LIMIT $2
    `, [anotador_id, parseInt(limite)]);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/anotacion/stats/:anotador_id ────────────────────
router.get("/stats/:anotador_id", async (req, res) => {
  try {
    const { anotador_id } = req.params;
    const [totales, porCategoria, totalOraciones] = await Promise.all([
      pool.query(`
        SELECT COUNT(*) AS anotadas FROM anotaciones
        WHERE anotador_id = $1 AND version = 1
      `, [anotador_id]),
      pool.query(`
        SELECT categoria, COUNT(*) AS total FROM anotaciones
        WHERE anotador_id = $1 AND version = 1
        GROUP BY categoria ORDER BY categoria
      `, [anotador_id]),
      pool.query(`
        SELECT COUNT(*) AS total FROM oraciones
        WHERE (compleja IS NULL OR compleja = FALSE)
      `),
    ]);
    res.json({
      anotadas:     parseInt(totales.rows[0].anotadas),
      total:        parseInt(totalOraciones.rows[0].total),
      porCategoria: Object.fromEntries(porCategoria.rows.map(r => [r.categoria, parseInt(r.total)])),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/anotacion/anotar ───────────────────────────────
router.post("/anotar", async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      oracion_id, anotador_id, categoria,
      elemento_sesgo, alternativa,
      elementos = [],
      confianza = "alta",
      notas, version = 1,
    } = req.body;

    if (!oracion_id || !anotador_id || !categoria)
      return res.status(400).json({ error: "oracion_id, anotador_id y categoria son obligatorios" });
    if (!["A", "B", "C"].includes(categoria))
      return res.status(400).json({ error: "categoria debe ser A, B o C" });

    await client.query("BEGIN");

    const result = await client.query(`
      INSERT INTO anotaciones
        (oracion_id, anotador_id, version, categoria,
         elemento_sesgo, alternativa, confianza, notas)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (oracion_id, anotador_id, version)
      DO UPDATE SET
        categoria      = EXCLUDED.categoria,
        elemento_sesgo = EXCLUDED.elemento_sesgo,
        alternativa    = EXCLUDED.alternativa,
        confianza      = EXCLUDED.confianza,
        notas          = EXCLUDED.notas
      RETURNING id, categoria
    `, [oracion_id, anotador_id, version, categoria,
        elemento_sesgo || null, alternativa || null,
        confianza, notas || null]);

    const anotacion_id = result.rows[0].id;

    await client.query("DELETE FROM elementos_sesgo WHERE anotacion_id = $1", [anotacion_id]);

    for (const el of elementos) {
      if (!el.elemento?.trim()) continue;
      await client.query(`
        INSERT INTO elementos_sesgo (anotacion_id, elemento, alternativa, tipo, subtipo)
        VALUES ($1, $2, $3, $4, $5)
      `, [anotacion_id, el.elemento.trim(), el.alternativa?.trim() || null,
          el.tipo || categoria, el.subtipo || null]);
    }

    await client.query("COMMIT");
    res.json({ id: anotacion_id, categoria, elementos_guardados: elementos.length });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── GET /api/anotacion/lexicon ────────────────────────────────
router.get("/lexicon", async (req, res) => {
  try {
    const { tipo } = req.query;
    const params = tipo ? [tipo] : [];
    const where  = tipo ? "WHERE es.tipo = $1" : "";
    const result = await pool.query(`
      SELECT es.elemento, es.alternativa, es.tipo, es.subtipo,
             COUNT(*) AS frecuencia,
             COUNT(DISTINCT an.anotador_id) AS anotadores
      FROM elementos_sesgo es
      JOIN anotaciones an ON an.id = es.anotacion_id
      ${where}
      GROUP BY es.elemento, es.alternativa, es.tipo, es.subtipo
      ORDER BY frecuencia DESC, es.elemento
    `, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/anotacion/kappa ─────────────────────────────────
router.get("/kappa", async (req, res) => {
  try {
    const { anotador1_id, anotador2_id, version = 1 } = req.query;
    const result = await pool.query(`
      SELECT a1.oracion_id, a1.categoria AS cat1, a2.categoria AS cat2
      FROM anotaciones a1
      JOIN anotaciones a2
        ON a1.oracion_id  = a2.oracion_id
       AND a2.anotador_id = $2 AND a2.version = $3
      WHERE a1.anotador_id = $1 AND a1.version = $3
      ORDER BY a1.oracion_id
    `, [anotador1_id, anotador2_id, version]);

    if (result.rows.length < 5)
      return res.json({ error: "Pocas oraciones compartidas", total: result.rows.length });

    const e1 = result.rows.map(r => r.cat1);
    const e2 = result.rows.map(r => r.cat2);
    const categorias = ["A", "B", "C"];
    const n = e1.length;
    let acuerdos = 0;
    const c1 = { A: 0, B: 0, C: 0 };
    const c2 = { A: 0, B: 0, C: 0 };
    for (let i = 0; i < n; i++) {
      if (e1[i] === e2[i]) acuerdos++;
      c1[e1[i]]++; c2[e2[i]]++;
    }
    const po = acuerdos / n;
    const pe = categorias.reduce((s, c) => s + (c1[c] / n) * (c2[c] / n), 0);
    const kappa = (po - pe) / (1 - pe);

    const kappaCategoria = {};
    for (const cat of categorias) {
      const y1 = e1.map(e => e === cat ? 1 : 0);
      const y2 = e2.map(e => e === cat ? 1 : 0);
      let ac = 0, cnt1 = 0, cnt2 = 0;
      y1.forEach((v, i) => { if (v === y2[i]) ac++; cnt1 += v; cnt2 += y2[i]; });
      const po_c = ac / n;
      const pe_c = (cnt1 / n) * (cnt2 / n) + ((n - cnt1) / n) * ((n - cnt2) / n);
      kappaCategoria[cat] = pe_c === 1 ? 1 : parseFloat(((po_c - pe_c) / (1 - pe_c)).toFixed(3));
    }

    res.json({
      kappa_global:    parseFloat(kappa.toFixed(3)),
      kappa_A:         kappaCategoria.A,
      kappa_B:         kappaCategoria.B,
      kappa_C:         kappaCategoria.C,
      total_oraciones: n,
      acuerdo_pct:     parseFloat((po * 100).toFixed(2)),
      valido:          kappa >= 0.6,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/anotacion/oraciones/:id/compleja ────────────────
router.put("/oraciones/:id/compleja", async (req, res) => {
  try {
    const { compleja = true } = req.body;
    const result = await pool.query(`
      UPDATE oraciones SET compleja = $1 WHERE id = $2 RETURNING id, compleja
    `, [compleja, req.params.id]);
    if (!result.rows.length)
      return res.status(404).json({ error: "Oración no encontrada" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
