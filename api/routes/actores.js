// actores.js — Endpoints para actores de eventos

const router = require("express").Router();
const pool   = require("../db");

// GET /api/actores/evento/:id
// Actores de un evento, ordenados por relevancia (menciones * fuentes)
router.get("/evento/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { tipo, limit = 20 } = req.query;

    const params = [id];
    let filtroTipo = "";
    if (tipo && ["PER", "ORG", "LOC"].includes(tipo)) {
      params.push(tipo);
      filtroTipo = `AND ae.tipo = $${params.length}`;
    }
    params.push(parseInt(limit));

    const result = await pool.query(`
      SELECT
        ae.id,
        ae.nombre_normalizado,
        ae.tipo,
        ae.cargo,
        ae.total_menciones,
        ae.num_fuentes,
        COALESCE(
          (SELECT jsonb_agg(DISTINCT f.nombre)
           FROM menciones_actor ma
           JOIN fuentes f ON f.id = ma.fuente_id
           WHERE ma.actor_id = ae.id),
          '[]'
        ) AS fuentes_mencionan,
        COALESCE(
          (SELECT jsonb_object_agg(sub.rol, sub.cnt)
           FROM (
             SELECT rol, COUNT(*) AS cnt
             FROM menciones_actor
             WHERE actor_id = ae.id AND rol IS NOT NULL
             GROUP BY rol
           ) sub),
          '{}'
        ) AS roles
      FROM actores_evento ae
      WHERE ae.evento_id = $1
        ${filtroTipo}
      ORDER BY (ae.total_menciones * ae.num_fuentes) DESC, ae.total_menciones DESC
      LIMIT $${params.length}
    `, params);

    res.json(result.rows);
  } catch (err) {
    console.error("[Actores]", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
