// auth.js — Login, logout y sesión actual.
//
// El JWT vive en una cookie httpOnly (nunca llega al JS del navegador,
// inmune a robo por XSS) en vez de localStorage. bias-scraper.ru-byte.com
// y api-bias-scraper.ru-byte.com comparten dominio registrable
// (ru-byte.com) — son "same-site" para el navegador aunque sean
// orígenes distintos — así que SameSite=Lax alcanza sin necesitar
// SameSite=None (que arrastra el bloqueo de cookies de terceros que
// los navegadores vienen endureciendo). Lax además da protección CSRF
// de facto en los POST: el navegador no manda la cookie en peticiones
// cross-site que no sean navegación top-level.
//
// Sin blacklist de tokens: logout borra la cookie del lado del
// servidor, que cubre el caso normal. Un JWT ya emitido sigue siendo
// válido hasta su expiración (10h) aunque se cierre sesión — es
// stateless por diseño. Con el volumen de usuarios de este proyecto,
// no justifica mantener una tabla de sesiones/tokens revocados.

const router = require("express").Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const pool = require("../db");
const { COOKIE_NAME } = require("../middleware/auth");

const JWT_EXPIRES_IN = "10h";
const COOKIE_MAX_AGE_MS = 10 * 60 * 60 * 1000;

// Hash "señuelo" precalculado (bcrypt de una cadena fija, sin relación
// con ninguna contraseña real) — se compara contra él cuando el
// usuario no existe, para que bcrypt.compare() tarde lo mismo en
// ambos casos y el tiempo de respuesta no delate si el usuario existe.
const DUMMY_HASH = "$2b$12$kWHilzNx75BaA.M7Xkn2rO5pvNCYT55nMO/5RWFCdOkYhc3iHwctS";

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  // Nota: si el servicio queda detrás de un proxy que no preserva la
  // IP real del cliente (revisar cómo Cloudflare Tunnel llega al
  // contenedor), puede hacer falta `app.set('trust proxy', ...)` en
  // index.js y un keyGenerator basado en CF-Connecting-IP para que
  // este límite sea por cliente real y no por IP del proxy.
  message: { error: "Demasiados intentos de inicio de sesión. Espera unos minutos." },
});

function cookieOptions() {
  return {
    httpOnly: true,
    // Secure requiere HTTPS — apagado en dev local (HTTP), prendido
    // en producción (Cloudflare Tunnel sirve todo por HTTPS).
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  };
}

// ── POST /api/auth/login ─────────────────────────────────────
router.post("/login", loginLimiter, async (req, res) => {
  try {
    if (!process.env.JWT_SECRET) {
      console.error("[Auth] JWT_SECRET no está configurada en el entorno.");
      return res.status(500).json({ error: "El servidor no tiene configurada la autenticación" });
    }

    const { usuario, password } = req.body;
    if (!usuario || !password) {
      return res.status(400).json({ error: "Usuario y contraseña son obligatorios" });
    }

    const result = await pool.query(
      "SELECT id, usuario, password_hash, rol FROM usuarios WHERE usuario = $1",
      [usuario]
    );
    const fila = result.rows[0];

    // Siempre se ejecuta un bcrypt.compare, exista o no el usuario —
    // ver DUMMY_HASH arriba.
    const claveValida = await bcrypt.compare(password, fila?.password_hash || DUMMY_HASH);

    if (!fila || !claveValida) {
      // Mensaje genérico a propósito: no revela si el usuario existe.
      return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
    }

    const token = jwt.sign(
      { id: fila.id, usuario: fila.usuario, rol: fila.rol },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: COOKIE_MAX_AGE_MS });
    res.json({ id: fila.id, usuario: fila.usuario, rol: fila.rol });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/auth/logout ────────────────────────────────────
router.post("/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, cookieOptions());
  res.json({ ok: true });
});

// ── GET /api/auth/me ─────────────────────────────────────────
// Nunca responde 401 — el frontend la llama al cargar para saber si
// hay sesión, y "sin sesión" es un estado normal, no un error.
router.get("/me", (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token || !process.env.JWT_SECRET) {
    return res.json({ usuario: null });
  }
  try {
    const datos = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ usuario: { id: datos.id, usuario: datos.usuario, rol: datos.rol } });
  } catch {
    res.json({ usuario: null });
  }
});

module.exports = router;
