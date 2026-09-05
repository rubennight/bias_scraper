// scraper.js — Endpoint para ejecutar el pipeline KDD

const router = require("express").Router();
const { spawn } = require("child_process");
const path = require("path");

// Middleware de autenticación por API key — solo para este router.
// Esta ruta dispara el pipeline pesado (scraping + NLP con
// transformers/torch); expuesta sin protección, cualquiera podría
// forzar corridas repetidas y saturar un servidor sin GPU.
function requireApiKey(req, res, next) {
  const esperado = process.env.SCRAPER_API_KEY;
  const recibido = req.header("X-API-Key");

  if (!esperado) {
    // Falta configurar la key en el servidor — no abrir la ruta por defecto.
    console.error("[Scraper] SCRAPER_API_KEY no está configurada en el entorno.");
    return res.status(500).json({ error: "El servidor no tiene configurada la autenticación del scraper" });
  }

  if (recibido !== esperado) {
    return res.status(401).json({ error: "API key inválida o ausente — envía el header X-API-Key" });
  }

  next();
}

// POST /api/scraper/run
// Ejecuta el pipeline KDD y streamea logs en tiempo real vía SSE
router.post("/run", requireApiKey, (req, res) => {
  console.log("[Scraper] Iniciando pipeline...");

  // Headers para SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  // Mismo origen permitido que el resto de la API (ver CORS_ORIGIN en
  // api/index.js) — esta ruta setea el header a mano porque responde
  // con SSE en vez de pasar por el middleware `cors()` normal. El
  // header solo admite UN origen, así que se refleja el de la
  // petición si está en la lista permitida (igual que hace `cors()`
  // internamente cuando se le da un arreglo de orígenes).
  const origenesPermitidos = (process.env.CORS_ORIGIN || "http://localhost:5173").split(",");
  const origenPeticion = req.headers.origin;
  res.setHeader(
    "Access-Control-Allow-Origin",
    origenesPermitidos.includes(origenPeticion) ? origenPeticion : origenesPermitidos[0]
  );

  const summary = {
    eventos_detectados: 0,
    articulos_guardados: 0,
    articulos_fallidos: 0,
    duracion: "00:00:00",
  };

  // Keepalive para mantener la conexión viva
  const keepaliveInterval = setInterval(() => {
    res.write(": keepalive\n\n");
  }, 5000);

  // Ejecutar pipeline.py con -u para deshabilitar buffering
  const scraperPath = path.join(__dirname, "../../scraper/pipeline.py");
  const pythonProcess = spawn("python", ["-u", scraperPath], {
    cwd: path.join(__dirname, "../../"),
    stdio: ["ignore", "pipe", "pipe"],
  });

  console.log("[Scraper] Proceso Python iniciado, PID:", pythonProcess.pid);

  let hasOutput = false;

  // Capturar stdout
  pythonProcess.stdout.on("data", (data) => {
    hasOutput = true;
    const text = data.toString();
    console.log("[Scraper stdout]", text);

    const lines = text.split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;

      // Parsear información resumida — con mejor matching
      if (line.includes("Eventos detectados")) {
        const match = line.match(/Eventos detectados\s*:\s*(\d+)/i);
        if (match) {
          summary.eventos_detectados = parseInt(match[1]);
          console.log("[Scraper] ✓ Eventos detectados:", summary.eventos_detectados);
        }
      }
      if (line.includes("Guardados en BD")) {
        const match = line.match(/Guardados en BD\s*:\s*(\d+)/i);
        if (match) {
          summary.articulos_guardados = parseInt(match[1]);
          console.log("[Scraper] ✓ Artículos guardados:", summary.articulos_guardados);
        }
      }
      if (line.includes("Fallidos")) {
        const match = line.match(/Fallidos\s*:\s*(\d+)/i);
        if (match) {
          summary.articulos_fallidos = parseInt(match[1]);
          console.log("[Scraper] ✓ Artículos fallidos:", summary.articulos_fallidos);
        }
      }
      if (line.includes("total") && line.includes("raci")) {
        const match = line.match(/Duraci.n total\s*:\s*(.+?)(?:\s*$)/i);
        if (match) {
          summary.duracion = match[1].trim();
          console.log("[Scraper] ✓ Duración:", summary.duracion);
        }
      }

      // Determinar nivel de log
      let level = "INFO";
      if (line.includes("[ERROR]")) level = "ERROR";
      if (line.includes("[DEBUG]")) level = "DEBUG";

      // Extraer timestamp y mensaje
      const logEntry = {
        type: "log",
        level,
        timestamp: new Date().toLocaleTimeString("es-MX"),
        message: line.trim(),
      };

      res.write(`data: ${JSON.stringify(logEntry)}\n\n`);
    }
  });

  // Capturar stderr
  pythonProcess.stderr.on("data", (data) => {
    hasOutput = true;
    const text = data.toString();
    console.log("[Scraper stderr]", text);

    const lines = text.split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      res.write(
        `data: ${JSON.stringify({
          type: "log",
          level: "ERROR",
          timestamp: new Date().toLocaleTimeString("es-MX"),
          message: line.trim(),
        })}\n\n`
      );
    }
  });

  // Cuando termina el proceso
  pythonProcess.on("close", (code) => {
    clearInterval(keepaliveInterval);

    console.log("[Scraper] Proceso finalizado con código:", code);
    console.log("[Scraper] ¿Tuvo output?:", hasOutput);
    console.log("[Scraper] Resumen final:", summary);

    // Enviar resumen
    res.write(
      `data: ${JSON.stringify({
        type: "summary",
        data: summary,
      })}\n\n`
    );

    // Señal de fin
    res.write(
      `data: ${JSON.stringify({
        type: "done",
        code,
      })}\n\n`
    );

    res.end();
  });

  // Manejo de errores
  pythonProcess.on("error", (err) => {
    clearInterval(keepaliveInterval);
    console.error("[Scraper] Error al iniciar proceso:", err);
    res.write(
      `data: ${JSON.stringify({
        type: "log",
        level: "ERROR",
        timestamp: new Date().toLocaleTimeString("es-MX"),
        message: `Error al ejecutar pipeline: ${err.message}`,
      })}\n\n`
    );
    res.end();
  });

  // Si el cliente cierra la pestaña/navega, matar el proceso
  res.on("close", () => {
    if (pythonProcess.exitCode === null) {
      console.log("[Scraper] Cliente cerró la conexión, matando proceso");
      clearInterval(keepaliveInterval);
      pythonProcess.kill();
    }
  });
});

module.exports = router;

