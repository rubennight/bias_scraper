// entrenamiento.js — Endpoints para Fase 5: Entrenamiento del clasificador

const router  = require("express").Router();
const pool    = require("../db");
const { spawn } = require("child_process");
const path    = require("path");

const SCRAPER_DIR    = path.join(__dirname, "..", "..", "scraper");
const PYTHON_CMD     = process.platform === "win32" ? "python" : "python3";
const MIN_ORACIONES  = 300;

// ── GET /api/entrenamiento/dataset ───────────────────────────
// Estado actual del dataset — cuántas oraciones hay por categoría
router.get("/dataset", async (req, res) => {
  try {
    const [totales, porCategoria, kappa] = await Promise.all([
      pool.query("SELECT COUNT(*) AS total FROM oraciones"),
      pool.query(`
        SELECT categoria, COUNT(*) AS total
        FROM anotaciones WHERE version = 1
        GROUP BY categoria ORDER BY categoria
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

    res.json({
      total_oraciones:  parseInt(totales.rows[0].total),
      total_anotadas:   totalAnotadas,
      por_categoria:    cats,
      min_requerido:    MIN_ORACIONES,
      min_por_categoria: minPorCat,
      listo_para_entrenar: listo,
      faltante: {
        A: Math.max(0, MIN_ORACIONES - cats.A),
        B: Math.max(0, MIN_ORACIONES - cats.B),
        C: Math.max(0, MIN_ORACIONES - cats.C),
      },
      ultimo_kappa: kappa.rows[0] || null,
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
