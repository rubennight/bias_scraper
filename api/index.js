// index.js — Servidor Express principal

const express = require("express");
const cors    = require("cors");
const path    = require("path");
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
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173").split(",");
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// Rutas
app.use("/api/stats",          require("./routes/stats"));
app.use("/api/eventos",        require("./routes/eventos"));
app.use("/api/articulos",      require("./routes/articulos"));
app.use("/api/anotacion",      require("./routes/anotacion"));
app.use("/api/entrenamiento",  require("./routes/entrenamiento"));
app.use("/api/actores",        require("./routes/actores"));
app.use("/api/scraper",        require("./routes/scraper"));

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
  console.log(`  POST http://localhost:${PORT}/api/scraper/run`);
});
