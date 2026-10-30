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
const { validarRegistro } = require("../lib/registro");

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

// El registro es público: se limita por IP para frenar el alta masiva
// de solicitudes basura.
const registroLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados registros desde esta conexión. Intenta más tarde." },
});

// Datos de sesión que ve el frontend — nunca incluye email ni celular.
function datosSesion(fila) {
  return {
    id: fila.id,
    usuario: fila.usuario,
    rol: fila.rol,
    anotador_id: fila.anotador_id ?? null,
    anotador: fila.anotador_id
      ? { id: fila.anotador_id, nombre: fila.anotador_nombre }
      : null,
  };
}

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

    // Se acepta el usuario o el email (las cuentas registradas entran
    // con su email, que se guarda en minúsculas).
    const result = await pool.query(
      `SELECT u.id, u.usuario, u.password_hash, u.rol, u.estado, u.anotador_id,
              a.nombre AS anotador_nombre
       FROM usuarios u
       LEFT JOIN anotadores a ON a.id = u.anotador_id
       WHERE u.usuario = $1 OR lower(u.email) = lower($1)
       LIMIT 1`,
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

    // El estado se revisa DESPUÉS de validar la contraseña: con una
    // contraseña incorrecta la respuesta es siempre el 401 genérico, así
    // no se puede averiguar si una cuenta está pendiente o rechazada.
    if (fila.estado === "pendiente") {
      return res.status(403).json({ error: "Tu cuenta está pendiente de aprobación" });
    }
    if (fila.estado === "rechazado") {
      return res.status(403).json({ error: "Tu solicitud fue rechazada" });
    }

    const token = jwt.sign(
      { id: fila.id, usuario: fila.usuario, rol: fila.rol, anotador_id: fila.anotador_id ?? null },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: COOKIE_MAX_AGE_MS });
    res.json(datosSesion(fila));
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
// Los datos se leen de la BD (no del token) para que un cambio de
// perfil o de estado se refleje sin esperar a que expire la sesión.
router.get("/me", async (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token || !process.env.JWT_SECRET) {
    return res.json({ usuario: null });
  }
  try {
    const datos = jwt.verify(token, process.env.JWT_SECRET);
    const r = await pool.query(
      `SELECT u.id, u.usuario, u.rol, u.estado, u.anotador_id, a.nombre AS anotador_nombre
       FROM usuarios u
       LEFT JOIN anotadores a ON a.id = u.anotador_id
       WHERE u.id = $1`,
      [datos.id]
    );
    const fila = r.rows[0];
    if (!fila || fila.estado !== "aprobado") return res.json({ usuario: null });
    res.json({ usuario: datosSesion(fila) });
  } catch {
    res.json({ usuario: null });
  }
});

// ── POST /api/auth/registro ──────────────────────────────────
// Crea una solicitud (estado 'pendiente'); no puede iniciar sesión hasta
// que el admin la apruebe. Siempre responde lo mismo si los datos son
// válidos, exista o no el email, para no revelar qué correos tienen cuenta.
router.post("/registro", registroLimiter, async (req, res) => {
  try {
    const v = validarRegistro(req.body);
    if (!v.ok) return res.status(400).json({ error: v.errores[0], errores: v.errores });

    const { nombre_completo, email, celular } = v.datos;
    // El hash se calcula siempre, para que el tiempo no delate duplicados.
    const hash = await bcrypt.hash(String(req.body.password), 12);

    // ON CONFLICT sin objetivo cubre tanto el usuario como el email únicos.
    await pool.query(
      `INSERT INTO usuarios (usuario, password_hash, rol, nombre_completo, email, celular, estado)
       VALUES ($1, $2, 'anotador', $3, $1, $4, 'pendiente')
       ON CONFLICT DO NOTHING`,
      [email, hash, nombre_completo, celular]
    );

    res.json({ ok: true, mensaje: "Solicitud enviada. Podrás entrar cuando sea aprobada." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
