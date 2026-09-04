// entrenamiento.js — Endpoints para Fase 5: Entrenamiento del clasificador

const router  = require("express").Router();
const pool    = require("../db");
const { spawn } = require("child_process");
const path    = require("path");

const SCRAPER_DIR    = path.join(__dirname, "..", "..", "scraper");
const PYTHON_CMD     = process.platform === "win32" ? "python" : "python3";
const MIN_ORACIONES  = 300;
const MIN_SUBTIPO    = 30;

// Subtipos válidos por tipo de elemento — ver elementos_sesgo.subtipo CHECK.
// Fuente de verdad para inicializar subtipos_detalle en 0 aunque el
// corpus todavía no tenga ningún elemento de ese subtipo.
const SUBTIPOS_POR_TIPO = {
  A: ["accion", "declaracion", "cifra", "historico", "legal"],
  B: ["lexical", "metafora", "epistemico", "omision", "encuadre"],
  C: ["lexical", "metafora", "epistemico", "omision", "encuadre"],
};

// ── GET /api/entrenamiento/dataset ───────────────────────────
router.get("/dataset", async (req, res) => {
  try {
    const [totales, porCategoria, porElemento, kappa] = await Promise.all([
      pool.query("SELECT COUNT(*) AS total FROM oraciones"),

      // Métrica 1 — oraciones por categoría dominante (para entrenamiento)
      pool.query(`
        SELECT categoria, COUNT(*) AS total
        FROM anotaciones WHERE version = 1
        GROUP BY categoria ORDER BY categoria
      `),

      // Métrica 2 — elementos por tipo y subtipo (para lexicón y features)
      pool.query(`
        SELECT es.tipo, es.subtipo, COUNT(*) AS total
        FROM elementos_sesgo es
        JOIN anotaciones an ON an.id = es.anotacion_id
        WHERE an.version = 1
        GROUP BY es.tipo, es.subtipo
        ORDER BY es.tipo, es.subtipo
      `),

      pool.query(`
        SELECT kappa_global, valido, calculado_en
        FROM sesiones_kappa
        ORDER BY calculado_en DESC LIMIT 1
      `),
    ]);

    const cats = { A: 0, B: 0, C: 0 };
    porCategoria.rows.forEach(r => { cats[r.categoria] = parseInt(r.total); });

    const totalAnotadas = cats.A + cats.B + cats.C;
    const minPorCat     = Math.min(cats.A, cats.B, cats.C);
    const listo         = minPorCat >= MIN_ORACIONES;

    // Elementos agrupados por tipo → subtipo
    const elementos = { A: {}, B: {}, C: {} };
    porElemento.rows.forEach(r => {
      const tipo    = r.tipo;
      const subtipo = r.subtipo || "sin_subtipo";
      if (!elementos[tipo]) elementos[tipo] = {};
      elementos[tipo][subtipo] = parseInt(r.total);
    });

    // Total de elementos por tipo
    const totalElementos = {
      A: Object.values(elementos.A || {}).reduce((s, v) => s + v, 0),
      B: Object.values(elementos.B || {}).reduce((s, v) => s + v, 0),
      C: Object.values(elementos.C || {}).reduce((s, v) => s + v, 0),
    };

    // Detalle por subtipo: cuenta + si alcanza MIN_SUBTIPO, inicializado
    // en 0 para los 15 subtipos aunque el corpus no tenga elementos aún.
    const subtiposDetalle = { A: {}, B: {}, C: {} };
    let subtiposSuficientes = true;
    for (const tipo of ["A", "B", "C"]) {
      for (const sub of SUBTIPOS_POR_TIPO[tipo]) {
        const total = (elementos[tipo] && elementos[tipo][sub]) || 0;
        const suficiente = total >= MIN_SUBTIPO;
        subtiposDetalle[tipo][sub] = { total, suficiente };
        if (!suficiente) subtiposSuficientes = false;
      }
    }

    // Estado de entrenamiento en tres niveles (ver bitácora del cambio):
    //   "anotando" → alguna categoría dominante < MIN_ORACIONES
    //   "base"     → las 3 categorías cumplen, pero algún subtipo < MIN_SUBTIPO
    //   "completo" → todo cumple, las 41 features (26 + 15 de subtipos) están listas
    const estadoEntrenamiento = !listo ? "anotando" : (subtiposSuficientes ? "completo" : "base");
    const featuresDisponibles = estadoEntrenamiento === "completo" ? 41 : 26;

    res.json({
      total_oraciones:      parseInt(totales.rows[0].total),
      total_anotadas:       totalAnotadas,
      por_categoria:        cats,
      min_requerido:        MIN_ORACIONES,
      min_por_categoria:    minPorCat,
      listo_para_entrenar:  listo,
      faltante: {
        A: Math.max(0, MIN_ORACIONES - cats.A),
        B: Math.max(0, MIN_ORACIONES - cats.B),
        C: Math.max(0, MIN_ORACIONES - cats.C),
      },
      // Nuevas métricas de elementos
      elementos_por_tipo:    totalElementos,
      elementos_por_subtipo: elementos,
      ultimo_kappa:          kappa.rows[0] || null,

      // Umbrales de subtipos (features de elementos, 15 de las 41 totales)
      min_por_subtipo:       MIN_SUBTIPO,
      subtipos_suficientes:  subtiposSuficientes,
      subtipos_detalle:      subtiposDetalle,

      // Estado de entrenamiento en tres niveles
      estado_entrenamiento:  estadoEntrenamiento,
      features_disponibles:  featuresDisponibles,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/entrenamiento/lista ─────────────────────────────
// Historial de todos los entrenamientos
router.get("/lista", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id, estado, progreso, mensaje,
        total_oraciones, f1_global,
        f1_A, f1_B, f1_C,
        precision_A, precision_B, precision_C,
        recall_A, recall_B, recall_C,
        kappa_dataset, modelo_path,
        iniciado_en, completado_en,
        error_msg
      FROM entrenamientos
      ORDER BY iniciado_en DESC
      LIMIT 20
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/entrenamiento/estado/:id ────────────────────────
// Estado actual de un entrenamiento (para polling)
router.get("/estado/:id", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id, estado, progreso, mensaje,
        total_oraciones, f1_global,
        f1_A, f1_B, f1_C,
        precision_A, precision_B, precision_C,
        recall_A, recall_B, recall_C,
        kappa_dataset, modelo_path,
        shap_features, confusion_matrix,
        iniciado_en, completado_en, error_msg
      FROM entrenamientos WHERE id = $1
    `, [req.params.id]);

    if (!result.rows.length)
      return res.status(404).json({ error: "Entrenamiento no encontrado" });

    const row = result.rows[0];

    // Parsear JSON guardado como TEXT
    if (row.shap_features) {
      try { row.shap_features = JSON.parse(row.shap_features); } catch {}
    }
    if (row.confusion_matrix) {
      try { row.confusion_matrix = JSON.parse(row.confusion_matrix); } catch {}
    }

    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/entrenamiento/iniciar ──────────────────────────
// Crea un job y dispara classifier.py en background
router.post("/iniciar", async (req, res) => {
  try {
    // Verificar que no haya un entrenamiento corriendo
    const corriendo = await pool.query(`
      SELECT id FROM entrenamientos
      WHERE estado IN ('pendiente', 'corriendo')
      ORDER BY iniciado_en DESC LIMIT 1
    `);

    if (corriendo.rows.length) {
      return res.status(409).json({
        error: "Ya hay un entrenamiento en curso",
        job_id: corriendo.rows[0].id,
      });
    }

    // Crear fila en BD
    const result = await pool.query(`
      INSERT INTO entrenamientos (estado, progreso, mensaje)
      VALUES ('pendiente', 0, 'Iniciando...')
      RETURNING id
    `);
    const job_id = result.rows[0].id;

    // Lanzar proceso Python en background
    const proceso = spawn(PYTHON_CMD, [
      path.join(SCRAPER_DIR, "classifier.py"),
      `--job_id=${job_id}`,
      `--min_oraciones=${MIN_ORACIONES}`,
    ], {
      cwd:      SCRAPER_DIR,
      detached: true,
      stdio:    "ignore",  // no bloquear el proceso Node
    });

    proceso.unref(); // Node no espera a que termine

    res.json({
      job_id,
      mensaje: "Entrenamiento iniciado. Usa GET /estado/:id para seguir el progreso.",
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/entrenamiento/:id ────────────────────────────
// Cancela o limpia un entrenamiento fallido
router.delete("/:id", async (req, res) => {
  try {
    const result = await pool.query(`
      UPDATE entrenamientos
      SET estado = 'cancelado', mensaje = 'Cancelado por el usuario'
      WHERE id = $1 AND estado IN ('pendiente', 'error')
      RETURNING id
    `, [req.params.id]);

    if (!result.rows.length)
      return res.status(400).json({ error: "Solo se pueden cancelar entrenamientos pendientes o con error" });

    res.json({ ok: true, id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
