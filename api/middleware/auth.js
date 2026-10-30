// middleware/auth.js — Autenticación (JWT en cookie httpOnly) y
// autorización por rol, reutilizables en cualquier router.
//
// requireAuth: exige una sesión válida, deja al usuario en req.usuario.
// requireRole(...roles): además exige que el rol del usuario esté en
// la lista permitida — úsalo DESPUÉS de requireAuth.

const jwt = require("jsonwebtoken");
const pool = require("../db");

const COOKIE_NAME = "token";

function requireAuth(req, res, next) {
  if (!process.env.JWT_SECRET) {
    console.error("[Auth] JWT_SECRET no está configurada en el entorno.");
    return res.status(500).json({ error: "El servidor no tiene configurada la autenticación" });
  }

  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: "No autenticado" });
  }

  try {
    req.usuario = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Sesión inválida o expirada" });
  }
}

function requireRole(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({ error: "No autenticado" });
    }
    if (!rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({ error: "No tienes permiso para esta acción" });
    }
    next();
  };
}

// requireAnotador: úsalo DESPUÉS de requireAuth en las rutas que actúan
// "como anotador" (pedir oraciones, anotar, borrar una anotación propia).
// La identidad sale de la BD, nunca del cliente: se ignora cualquier
// anotador_id en query, params o body, así nadie anota a nombre de otro.
// Deja el perfil de la sesión en req.anotadorId.
async function requireAnotador(req, res, next) {
  try {
    const r = await pool.query(
      "SELECT anotador_id, estado FROM usuarios WHERE id = $1",
      [req.usuario.id]
    );
    const fila = r.rows[0];
    if (!fila || fila.estado !== "aprobado") {
      return res.status(403).json({ error: "Tu cuenta no está aprobada" });
    }
    if (!fila.anotador_id) {
      return res.status(403).json({ error: "Tu cuenta no tiene perfil de anotador" });
    }
    req.anotadorId = fila.anotador_id;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { requireAuth, requireRole, requireAnotador, COOKIE_NAME };
