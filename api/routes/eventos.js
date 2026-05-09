// eventos.js — Endpoints para eventos y sus artículos

const router = require("express").Router();
const pool   = require("../db");

// GET /api/eventos
// Lista todos los eventos con filtros opcionales
// Query params: keyword, desde, hasta, page, limit
router.get("/", async (req, res) => {
  try {
    const { keyword, desde, hasta, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const params = [];
    const where  = [];

    if (keyword) {
      params.push(`%${keyword.toLowerCase()}%`);
      where.push(`
        EXISTS (
          SELECT 1 FROM articulo_keywords ak
          JOIN articulos a ON a.id = ak.articulo_id
          WHERE a.evento_id = e.id
          AND ak.keyword ILIKE $${params.length}
        )
      `);
    }

    if (desde) {
      params.push(desde);
      where.push(`e.ventana_inicio >= $${params.length}`);
    }

    if (hasta) {
      params.push(hasta);
      where.push(`e.ventana_fin <= $${params.length}`);
    }

    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

    // Total para paginación
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM eventos e ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Eventos con sus top keywords
    params.push(limit, offset);
    const result = await pool.query(`
      SELECT
        e.id,
        e.titular_evento,
        e.num_fuentes,
        e.ventana_inicio,
        e.ventana_fin,
        e.detectado_en,
        COALESCE(
          ARRAY(
            SELECT ak.keyword
            FROM articulo_keywords ak
            JOIN articulos a ON a.id = ak.articulo_id
            WHERE a.evento_id = e.id
            GROUP BY ak.keyword
            ORDER BY COUNT(*) DESC
            LIMIT 5
          ), '{}'
        ) AS top_keywords,
        COUNT(DISTINCT a.id)       AS total_articulos,
        COUNT(DISTINCT a.fuente_id) AS fuentes_distintas
      FROM eventos e
      LEFT JOIN articulos a ON a.evento_id = e.id
      ${whereClause}
      GROUP BY e.id
      ORDER BY e.detectado_en DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    res.json({
      total,
      page:    parseInt(page),
      limit:   parseInt(limit),
      eventos: result.rows,
    });
  } catch (err) {
    console.error("[Eventos]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/eventos/buscar?q=rocha
// Búsqueda rápida por keyword para el buscador en tiempo real
router.get("/buscar", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);

    const result = await pool.query(`
      SELECT DISTINCT
        e.id,
        e.titular_evento,
        e.ventana_inicio,
        e.ventana_fin,
        e.num_fuentes
      FROM eventos e
      JOIN articulos a ON a.evento_id = e.id
      JOIN articulo_keywords ak ON ak.articulo_id = a.id
      WHERE ak.keyword ILIKE $1
         OR e.titular_evento ILIKE $1
      ORDER BY e.detectado_en DESC
      LIMIT 10
    `, [`%${q}%`]);

    res.json(result.rows);
  } catch (err) {
    console.error("[Buscar]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/eventos/:id
// Detalle completo de un evento con todos sus artículos agrupados por fuente
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Datos del evento
    const eventoResult = await pool.query(`
      SELECT
        e.id,
        e.titular_evento,
        e.num_fuentes,
        e.ventana_inicio,
        e.ventana_fin,
        e.detectado_en,
        COALESCE(
          ARRAY(
            SELECT ak.keyword
            FROM articulo_keywords ak
            JOIN articulos a ON a.id = ak.articulo_id
            WHERE a.evento_id = e.id
            GROUP BY ak.keyword
            ORDER BY COUNT(*) DESC
            LIMIT 8
          ), '{}'
        ) AS top_keywords
      FROM eventos e
      WHERE e.id = $1
    `, [id]);

    if (!eventoResult.rows.length) {
      return res.status(404).json({ error: "Evento no encontrado" });
    }

    const evento = eventoResult.rows[0];

    // Artículos del evento con sus fuentes y keywords
    const articulosResult = await pool.query(`
      SELECT
        a.id,
        a.titular,
        a.autor,
        a.fecha_pub,
        a.url,
        a.metodo,
        a.scrapeado_en,
        a.anotado,
        f.nombre    AS fuente_nombre,
        f.orientacion,
        COALESCE(
          ARRAY(
            SELECT ak.keyword
            FROM articulo_keywords ak
            WHERE ak.articulo_id = a.id
            ORDER BY ak.keyword
          ), '{}'
        ) AS keywords
      FROM articulos a
      JOIN fuentes f ON f.id = a.fuente_id
      WHERE a.evento_id = $1
      ORDER BY f.orientacion, f.nombre, a.fecha_pub DESC
    `, [id]);

    // Agrupar artículos por fuente
    const porFuente = {};
    for (const art of articulosResult.rows) {
      const fuente = art.fuente_nombre;
      if (!porFuente[fuente]) {
        porFuente[fuente] = {
          nombre:      fuente,
          orientacion: art.orientacion,
          articulos:   [],
        };
      }
      porFuente[fuente].articulos.push({
        id:          art.id,
        titular:     art.titular,
        autor:       art.autor,
        fecha_pub:   art.fecha_pub,
        url:         art.url,
        keywords:    art.keywords,
        anotado:     art.anotado,
      });
    }

    res.json({
      ...evento,
      fuentes: Object.values(porFuente),
    });
  } catch (err) {
    console.error("[Evento detalle]", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
