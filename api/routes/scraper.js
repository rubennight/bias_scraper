// scraper.js — Endpoint para disparar el pipeline KDD
//
// api/ y scraper/ son contenedores Docker separados; api/ no tiene
// Python. En vez de spawn("python", ...) (que fallaba con ENOENT
// dentro del contenedor de la API), esta ruta hace de proxy HTTP
// hacia el servicio Flask que corre dentro del contenedor scraper
// (ver scraper/server.py), reenviando su stream SSE tal cual al
// frontend — el contrato de /api/scraper/run no cambia.

const router = require("express").Router();
const { Readable } = require("stream");

const SCRAPER_URL = process.env.SCRAPER_URL || "http://scraper:8000";
const CONNECT_TIMEOUT_MS = 10000;

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

function eventoSSE(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function horaActual() {
  return new Date().toLocaleTimeString("es-MX");
}

// POST /api/scraper/run
// Reenvía la corrida al servicio scraper y streamea sus logs (SSE)
router.post("/run", requireApiKey, async (req, res) => {
  console.log(`[Scraper] Solicitando corrida a ${SCRAPER_URL}/run ...`);

  // Headers para SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  // Mismo origen permitido que el resto de la API (ver CORS_ORIGIN en
  // api/index.js). El header solo admite UN origen, así que se refleja
  // el de la petición si está en la lista permitida.
  const origenesPermitidos = (process.env.CORS_ORIGIN || "http://localhost:5173").split(",");
  const origenPeticion = req.headers.origin;
  res.setHeader(
    "Access-Control-Allow-Origin",
    origenesPermitidos.includes(origenPeticion) ? origenPeticion : origenesPermitidos[0]
  );

  const controller = new AbortController();
  // Timeout solo para ESTABLECER la conexión — una vez que llega la
  // respuesta se desarma (clearTimeout), así el stream puede seguir
  // vivo varios minutos (la corrida real tarda ~9 min) sin que este
  // timeout lo corte a mitad de camino.
  const connectTimer = setTimeout(() => {
    controller.abort(new Error("timeout de conexión con el servicio scraper"));
  }, CONNECT_TIMEOUT_MS);

  let upstream;
  try {
    upstream = await fetch(`${SCRAPER_URL}/run`, {
      method: "POST",
      headers: { "X-API-Key": process.env.SCRAPER_API_KEY || "" },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(connectTimer);
    const motivo = err.name === "AbortError"
      ? `El servicio scraper no respondió en ${CONNECT_TIMEOUT_MS / 1000}s`
      : err.message;
    console.error("[Scraper] No se pudo conectar al servicio scraper:", motivo);
    res.write(eventoSSE({
      type: "log", level: "ERROR", timestamp: horaActual(),
      message: `No se pudo conectar al servicio scraper (${SCRAPER_URL}): ${motivo}`,
    }));
    res.write(eventoSSE({ type: "done", code: 1 }));
    return res.end();
  }
  clearTimeout(connectTimer);

  if (!upstream.ok || !upstream.body) {
    let detalle = `HTTP ${upstream.status}`;
    try {
      const body = await upstream.json();
      if (body?.error) detalle = body.error;
    } catch { /* respuesta no era JSON, nos quedamos con el status */ }

    console.error("[Scraper] El servicio scraper respondió con error:", detalle);
    res.write(eventoSSE({
      type: "log", level: "ERROR", timestamp: horaActual(),
      message: `El servicio scraper respondió con error: ${detalle}`,
    }));
    res.write(eventoSSE({ type: "done", code: 1 }));
    return res.end();
  }

  // Reenviar el stream del servicio scraper directo al cliente —
  // ya viene formateado como SSE (mismos eventos log/summary/done).
  const upstreamStream = Readable.fromWeb(upstream.body);
  upstreamStream.pipe(res);

  upstreamStream.on("error", (err) => {
    console.error("[Scraper] Error leyendo el stream del servicio scraper:", err.message);
    if (!res.writableEnded) {
      res.write(eventoSSE({
        type: "log", level: "ERROR", timestamp: horaActual(),
        message: `Se perdió la conexión con el servicio scraper: ${err.message}`,
      }));
      res.write(eventoSSE({ type: "done", code: 1 }));
      res.end();
    }
  });

  // Si el cliente cierra la pestaña/navega, abortar la corrida upstream
  // (el servicio scraper mata el subproceso de pipeline.py al perder
  // la conexión, igual que hacía Node antes con pythonProcess.kill()).
  req.on("close", () => {
    if (!res.writableEnded) {
      console.log("[Scraper] Cliente cerró la conexión, abortando corrida en el servicio scraper");
      controller.abort();
    }
  });
});

module.exports = router;
