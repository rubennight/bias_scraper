// index.js — Servidor Express principal

const express = require("express");
const cors    = require("cors");
require("dotenv").config({ path: "../.env" });

const app  = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors({ origin: "http://localhost:5173" })); // Vite dev server
app.use(express.json());

// Rutas
app.use("/api/stats",     require("./routes/stats"));
app.use("/api/eventos",   require("./routes/eventos"));
app.use("/api/articulos", require("./routes/articulos"));
app.use("/api/scraper",   require("./routes/scraper"));

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
