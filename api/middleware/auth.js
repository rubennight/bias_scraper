// middleware/auth.js — Autenticación (JWT en cookie httpOnly) y
// autorización por rol, reutilizables en cualquier router.
//
// requireAuth: exige una sesión válida, deja al usuario en req.usuario.
// requireRole(...roles): además exige que el rol del usuario esté en
// la lista permitida — úsalo DESPUÉS de requireAuth.

const jwt = require("jsonwebtoken");

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

module.exports = { requireAuth, requireRole, COOKIE_NAME };
