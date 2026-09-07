// index.js — Servidor Express principal

const express      = require("express");
const cors         = require("cors");
const cookieParser = require("cookie-parser");
const path         = require("path");
// path.resolve(__dirname, ...) en vez de una ruta relativa a secas:
// una ruta relativa como "../.env" se resuelve contra el cwd del
// proceso, no contra la ubicación de este archivo — si algo invoca
// `node api/index.js` desde la raíz (común en Docker), no encontraba
// el .env. En contenedor no pasa nada si el archivo no existe: las
// variables ya vienen inyectadas por docker-compose.
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const app  = express();
const PORT = process.env.PORT || 3001;

// Middlewares
// CORS_ORIGIN acepta uno o varios orígenes separados por coma —
// necesario para aceptar tanto localhost (dev) como el dominio
// público una vez expuesto vía Cloudflare Tunnel.
// credentials: true es obligatorio para que el navegador mande/reciba
// la cookie httpOnly de sesión en peticiones cross-origin (frontend y
// api viven en subdominios distintos) — por eso origin NO puede ser
// wildcard "*", tiene que ser la lista explícita de abajo.
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173").split(",");
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use(cookieParser());

const { requireAuth, requireRole } = require("./middleware/auth");

// Rutas — lectura pública (Dashboard, Eventos)
app.use("/api/stats",          require("./routes/stats"));
app.use("/api/eventos",        require("./routes/eventos"));
app.use("/api/articulos",      require("./routes/articulos"));
app.use("/api/actores",        require("./routes/actores"));

// Login / sesión — siempre pública, no tiene sentido protegerla
app.use("/api/auth",           require("./routes/auth"));

// Anotación — requiere sesión de anotador o admin
app.use("/api/anotacion",      requireAuth, requireRole("anotador", "admin"), require("./routes/anotacion"));

// Entrenamiento y Scraper — solo admin
app.use("/api/entrenamiento",  requireAuth, requireRole("admin"), require("./routes/entrenamiento"));
app.use("/api/scraper",        requireAuth, requireRole("admin"), require("./routes/scraper"));

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: `Ruta ${req.path} no encontrada` });
});

app.listen(PORT, () => {
  console.log(`[Server] Backend corriendo en http://localhost:${PORT}`);
  console.log(`[Server] Endpoints disponibles:`);
  console.log(`  GET  http://localhost:${PORT}/api/health`);
  console.log(`  GET  http://localhost:${PORT}/api/stats`);
  console.log(`  GET  http://localhost:${PORT}/api/eventos`);
  console.log(`  GET  http://localhost:${PORT}/api/eventos/buscar?q=keyword`);
  console.log(`  GET  http://localhost:${PORT}/api/eventos/:id`);
  console.log(`  GET  http://localhost:${PORT}/api/articulos/:id`);
  console.log(`  PUT  http://localhost:${PORT}/api/articulos/:id/anotar`);
  console.log(`  POST http://localhost:${PORT}/api/auth/login`);
  console.log(`  POST http://localhost:${PORT}/api/auth/logout`);
  console.log(`  GET  http://localhost:${PORT}/api/auth/me`);
  console.log(`  POST http://localhost:${PORT}/api/scraper/run          (requiere sesión admin)`);
  console.log(`  *    http://localhost:${PORT}/api/anotacion/*          (requiere sesión anotador/admin)`);
  console.log(`  *    http://localhost:${PORT}/api/entrenamiento/*      (requiere sesión admin)`);
});
