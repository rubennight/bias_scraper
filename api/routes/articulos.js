// articulos.js — Endpoints para artículos individuales

const router = require("express").Router();
const pool   = require("../db");

// GET /api/articulos/:id
// Retorna el cuerpo completo de un artículo
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        a.id, a.titular, a.cuerpo, a.autor,
        a.fecha_pub, a.url, a.metodo, a.anotado,
        f.nombre AS fuente_nombre, f.orientacion,
        ARRAY(
          SELECT ak.keyword FROM articulo_keywords ak
          WHERE ak.articulo_id = a.id ORDER BY ak.keyword
        ) AS keywords
      FROM articulos a
      JOIN fuentes f ON f.id = a.fuente_id
      WHERE a.id = $1
    `, [req.params.id]);

    if (!result.rows.length)
      return res.status(404).json({ error: "Artículo no encontrado" });

    res.json(result.rows[0]);
  } catch (err) {
    console.error("[Artículo]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/articulos/:id/anotar
// Marca o desmarca un artículo para anotación (Fase 4)
router.put("/:id/anotar", async (req, res) => {
  try {
    const { anotado } = req.body;

    const result = await pool.query(`
      UPDATE articulos
      SET anotado = $1
      WHERE id = $2
      RETURNING id, titular, anotado
    `, [anotado, req.params.id]);

    if (!result.rows.length)
      return res.status(404).json({ error: "Artículo no encontrado" });

    res.json(result.rows[0]);
  } catch (err) {
    console.error("[Anotar]", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
