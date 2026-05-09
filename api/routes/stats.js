// stats.js — Estadísticas generales del corpus

const router = require("express").Router();
const pool   = require("../db");

// GET /api/stats
router.get("/", async (req, res) => {
  try {
    const [totales, porOrientacion, porFuente, topKeywords, eventosPorSemana] =
      await Promise.all([

        pool.query(`
          SELECT
            (SELECT COUNT(*) FROM eventos)           AS total_eventos,
            (SELECT COUNT(*) FROM articulos)         AS total_articulos,
            (SELECT COUNT(*) FROM fuentes)           AS total_fuentes,
            (SELECT COUNT(DISTINCT keyword)
               FROM articulo_keywords)              AS total_keywords
        `),

        pool.query(`
          SELECT f.orientacion, COUNT(a.id) AS total
          FROM articulos a
          JOIN fuentes f ON f.id = a.fuente_id
          GROUP BY f.orientacion
          ORDER BY total DESC
        `),

        pool.query(`
          SELECT f.nombre, f.orientacion, COUNT(a.id) AS total
          FROM articulos a
          JOIN fuentes f ON f.id = a.fuente_id
          GROUP BY f.nombre, f.orientacion
          ORDER BY total DESC
        `),

        pool.query(`
          SELECT keyword, COUNT(*) AS frecuencia
          FROM articulo_keywords
          GROUP BY keyword
          ORDER BY frecuencia DESC
          LIMIT 12
        `),

        pool.query(`
          SELECT ventana_inicio, ventana_fin,
                 COUNT(*) AS total_eventos,
                 SUM(num_fuentes) AS fuentes_cubiertas
          FROM eventos
          GROUP BY ventana_inicio, ventana_fin
          ORDER BY ventana_inicio DESC
          LIMIT 8
        `),
      ]);

    res.json({
      totales:          totales.rows[0],
      porOrientacion:   porOrientacion.rows,
      porFuente:        porFuente.rows,
      topKeywords:      topKeywords.rows,
      eventosPorSemana: eventosPorSemana.rows,
    });
  } catch (err) {
    console.error("[Stats]", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
