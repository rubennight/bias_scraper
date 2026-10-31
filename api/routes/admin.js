// admin.js — Gestión de solicitudes de registro (solo admin).
//
// Se monta en index.js con requireAuth + requireRole("admin"). Las
// "solicitudes" son las filas de `usuarios` creadas por el registro
// público (tienen nombre_completo); las cuentas creadas a mano con
// scripts/crear-admin.js no aparecen aquí.

const router = require("express").Router();
const pool   = require("../db");

const ESTADOS = ["pendiente", "aprobado", "rechazado"];

// ── GET /api/admin/solicitudes/contador ──────────────────────
// Se declara antes que las rutas con :id para que "contador" no se
// interprete como un id.
router.get("/solicitudes/contador", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS pendientes FROM usuarios
       WHERE estado = 'pendiente' AND nombre_completo IS NOT NULL`
    );
    res.json({ pendientes: r.rows[0].pendientes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/solicitudes?estado=pendiente ──────────────
router.get("/solicitudes", async (req, res) => {
  try {
    const estado = req.query.estado || "pendiente";
    if (!ESTADOS.includes(estado))
      return res.status(400).json({ error: "estado debe ser pendiente, aprobado o rechazado" });

    const r = await pool.query(
      `SELECT id, nombre_completo, email, celular, estado, creado_en,
              revisado_en, motivo_rechazo, anotador_id
       FROM usuarios
       WHERE nombre_completo IS NOT NULL AND estado = $1
       ORDER BY creado_en`,
      [estado]
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/solicitudes/:id/aprobar ──────────────────
// body: { anotador_id? } — con anotador_id vincula la cuenta a un perfil
// de anotador existente; sin él, crea un perfil nuevo con el nombre
// completo. Todo en una transacción.
router.post("/solicitudes/:id/aprobar", async (req, res) => {
  const client = await pool.connect();
  try {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

    await client.query("BEGIN");

    const sol = await client.query(
      `SELECT id, estado, nombre_completo FROM usuarios
       WHERE id = $1 AND nombre_completo IS NOT NULL FOR UPDATE`,
      [id]
    );
    if (!sol.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Solicitud no encontrada" });
    }
    if (sol.rows[0].estado !== "pendiente") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "La solicitud ya fue revisada" });
    }

    let anotadorId;
    if (req.body?.anotador_id !== undefined && req.body?.anotador_id !== null && req.body?.anotador_id !== "") {
      anotadorId = parseInt(req.body.anotador_id);
      const existe = await client.query("SELECT id FROM anotadores WHERE id = $1", [anotadorId]);
      if (!existe.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "El perfil de anotador no existe" });
      }
      const enUso = await client.query("SELECT id FROM usuarios WHERE anotador_id = $1", [anotadorId]);
      if (enUso.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Ese perfil ya está ligado a otra cuenta" });
      }
    } else {
      const nuevo = await client.query(
        `INSERT INTO anotadores (nombre, descripcion) VALUES ($1, 'Anotador')
         ON CONFLICT (nombre) DO NOTHING RETURNING id`,
        [sol.rows[0].nombre_completo]
      );
      if (!nuevo.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: "Ya existe un perfil con ese nombre; elige vincularlo en lugar de crear uno nuevo",
        });
      }
      anotadorId = nuevo.rows[0].id;
    }

    await client.query(
      `UPDATE usuarios
       SET estado = 'aprobado', rol = 'anotador', anotador_id = $2,
           revisado_por = $3, revisado_en = now(), motivo_rechazo = NULL
       WHERE id = $1`,
      [id, anotadorId, req.usuario.id]
    );

    await client.query("COMMIT");
    res.json({ ok: true, anotador_id: anotadorId });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── POST /api/admin/solicitudes/:id/rechazar ─────────────────
// body: { motivo? } — no borra la fila.
router.post("/solicitudes/:id/rechazar", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "id inválido" });

    const r = await pool.query(
      `UPDATE usuarios
       SET estado = 'rechazado', revisado_por = $2, revisado_en = now(), motivo_rechazo = $3
       WHERE id = $1 AND estado = 'pendiente' AND nombre_completo IS NOT NULL
       RETURNING id`,
      [id, req.usuario.id, req.body?.motivo?.trim() || null]
    );
    if (!r.rows[0])
      return res.status(409).json({ error: "La solicitud no existe o ya fue revisada" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
