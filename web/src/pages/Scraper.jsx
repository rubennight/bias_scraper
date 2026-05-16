import { useState, useRef, useEffect } from "react";
import { runScraper } from "../api";

// ── 8 medios del espectro ideológico ──────────────────────────────
const GROUPS = [
  { key: "izquierda", label: "Izquierda",  color: "var(--rev)",      medios: ["La Jornada", "El Informador"] },
  { key: "critico",   label: "Crítico",    color: "var(--ochre)",    medios: ["Aristegui Noticias", "El Financiero"] },
  { key: "centro",    label: "Centro",     color: "var(--graphite)", medios: ["Animal Político", "El Universal"] },
  { key: "derecha",   label: "Derecha",    color: "var(--ink)",      medios: ["24 Horas", "El Norte"] },
];

// ── Fases del pipeline ─────────────────────────────────────────────
const PHASES = [
  {
    id: "init",
    num: "00",
    label: "Inicialización",
    sub: "Ventana ISO · Tablas · Fuentes",
    desc: `Se establece la ventana temporal ISO — bloques fijos de lunes a domingo — que garantiza que múltiples ejecuciones en la misma semana no generen duplicados. La clave: el filtro usa la fecha de publicación del artículo (fecha_pub), no la fecha de ejecución del pipeline.`,
    detail: `fecha.weekday() retorna 0 para lunes, 6 para domingo. Restar ese valor siempre lleva al lunes de esa semana. Correr el pipeline 5 veces en la misma semana produce la misma ventana — sin duplicados. El 74% de los artículos recuperables por RSS tienen fecha del día de ejecución, con un rango real de 3-4 días.`,
    algo: `lunes   = fecha - timedelta(days=fecha.weekday())
domingo = lunes + timedelta(days=6)
# La ventana es fija: mismo lunes sin importar cuándo ejecutes`,
    rejected: null,
    showMedios: false,
  },
  {
    id: "seleccion",
    num: "01",
    label: "Fase 1 — Selección",
    sub: "RSS · 8 medios · Filtrado temático",
    desc: `El sistema lee los feeds RSS de 8 medios con orientaciones ideológicas distintas. No descarga artículos manualmente: cada medio publica un archivo XML que actualiza automáticamente con sus artículos más recientes de política, economía y seguridad.`,
    detail: `El balance 2-2-2-2 es metodológicamente esencial. Con 6 medios de izquierda y 2 de derecha, el clasificador aprendería que el lenguaje de izquierda es "normal". El balance evita ese sesgo estructural en el corpus de entrenamiento.

Cuatro medios descartados empíricamente: Sin Embargo (HTTP 403 — bloquea bots), Proceso (XML malformado), Milenio y El Heraldo (HTTP 404). Decisión documentada — no fue capricho, fue verificación empírica.

Google Trends fue descartado como señal de relevancia: pytrends usa endpoints internos que Google deprecó. Todos devuelven HTTP 404. La descarga directa por secciones RSS es metodológicamente superior porque no introduce el sesgo de Google en qué eventos analizar.`,
    algo: `# Filtrado en dos pasos sobre el titular del artículo

Paso 1 — Lista de exclusión:
any(p in titular for p in EXCLUIR)    → descartado inmediatamente
# "fútbol", "vs", "en vivo", "BTS", "granizada"...

Paso 2 — Lista blanca:
any(p in titular for p in RELEVANTES) → conservado
# "gobierno", "Trump", "violencia", "aranceles", "fiscalía"...

# Resultado típico: 390 artículos → 113 relevantes (71% descartado)`,
    rejected: null,
    showMedios: true,
  },
  {
    id: "extraccion",
    num: "02",
    label: "Fase 2 — Preprocesamiento",
    sub: "Newspaper3k · Playwright · TF-IDF",
    desc: `Para cada artículo filtrado, Newspaper3k descarga el HTML completo y extrae solo el cuerpo periodístico, eliminando menús, publicidad y pie de página. Las citas directas entre comillas se eliminan para aislar el lenguaje del periodista — no el de sus fuentes. TF-IDF convierte el cuerpo en keywords.`,
    detail: `Si Newspaper3k falla —porque el sitio usa JavaScript dinámico y el contenido no está en el HTML estático— Playwright actúa como fallback: un navegador Chromium real ejecuta el JS y extrae el contenido ya renderizado. Es más lento pero funciona en sitios modernos.

TF-IDF responde: ¿qué palabras son especialmente importantes en este artículo comparado con todos los demás? Una palabra que aparece mucho aquí Y poco en el corpus general tiene score alto — esa es la keyword del evento.`,
    algo: `TF(t, d)  = ocurrencias(t, d) / total_palabras(d)
IDF(t)    = log( N / documentos_con_t )
TF·IDF    = TF × IDF

# Caso Rocha Moya (ejemplo real):
"rocha"     → 0.020 × 1.30 = 0.026   ← keyword alta
"sinaloa"   → 0.015 × 1.10 = 0.016   ← keyword media
"gobierno"  → 0.010 × 0.04 = 0.0004  ← muy común → no es keyword
"el"        → 0.050 × 0.00 = 0.000   ← stopword

# Resultado típico: 101 / 113 artículos con keywords exitosas`,
    rejected: null,
    showMedios: false,
  },
  {
    id: "grafo",
    num: "03",
    label: "Fase 3 — Transformación",
    sub: "Grafo de co-ocurrencia · BFS · Clustering",
    desc: `Se construye un grafo donde cada nodo es un artículo. Si dos artículos de fuentes distintas comparten ≥4 keywords TF-IDF, se traza una arista entre ellos. Para 101 artículos hay 5,050 comparaciones posibles. BFS recorre el grafo y agrupa en componentes conectadas. Cada componente es un evento.`,
    detail: `La condición de fuentes distintas es crítica: no tiene sentido conectar dos artículos del mismo periódico. El parámetro MIN=4 se eligió empíricamente — con 3 había demasiado ruido, artículos de temas distintos se conectaban por keywords genéricas del contexto político mexicano.

Solo se conservan clusters con artículos de ≥3 fuentes distintas — eso garantiza diversidad ideológica real para comparar sesgo. Un evento cubierto por 2 medios del mismo lado del espectro no aporta información comparativa útil.`,
    algo: `kw_A ∩ kw_B ≥ 4  →  arista(A, B)     # intersección de sets: O(min(|A|,|B|))

BFS(grafo) → componentes conectadas
           → descartar clusters con < 3 fuentes distintas

# Validado 04/05/2026:
# 3 eventos · 56 artículos · 0 fallos · ~9 minutos
# Rocha/Sinaloa: 49 art. · 8 fuentes
# El Chapo extradición: 4 art. · 4 fuentes
# Elección CDMX: 3 art. · 3 fuentes`,
    rejected: [
      {
        name: "XLM-RoBERTa + DBSCAN",
        reason: "Embeddings de 768 dimensiones. Problema: similaridad media 0.9982 entre todos los artículos. El modelo base sin fine-tuning ve «noticias en español» y las agrupa juntas — no distingue el caso Rocha Moya del GP de Miami. Ambos son texto periodístico formal en español.",
      },
      {
        name: "AgglomerativeClustering",
        reason: "Más estricto que DBSCAN: un artículo entra al cluster solo si es similar a TODOS sus miembros. Pero el problema de fondo era el mismo: embeddings demasiado similares entre sí → cualquier umbral producía un solo cluster gigante con todos los artículos.",
      },
    ],
    showMedios: false,
  },
  {
    id: "guardado",
    num: "04",
    label: "Persistencia",
    sub: "PostgreSQL · Idempotencia · Keywords indexadas",
    desc: `Cada evento detectado y sus artículos se persisten en PostgreSQL. Las keywords TF-IDF se guardan en una tabla separada (articulo_keywords) indexada para búsquedas eficientes. El esquema es idempotente: la restricción UNIQUE en URLs y la ventana ISO previenen duplicados aunque el pipeline se ejecute múltiples veces en la misma semana.`,
    detail: `Idempotencia significa que correr el pipeline N veces produce el mismo resultado que correrlo una vez. Esto es fundamental para un pipeline de investigación reproducible. El timestamp de cada artículo (fecha_pub) determina su ventana — no la fecha de ejecución.`,
    algo: null,
    rejected: null,
    showMedios: false,
  },
];

// ── Detección de fase y métricas por log ──────────────────────────

function nextPhaseFrom(msg, current) {
  if (current < 1 && /\[Selección\]/i.test(msg)) return 1;
  if (current < 2 && /\[Transformación\]/i.test(msg)) return 2;
  if (current < 3 && /\[Grafo\]/i.test(msg)) return 3;
  if (current < 4 && /\[3\/3\]/i.test(msg)) return 4;
  return null;
}

function parseMetric(msg) {
  let m;
  m = msg.match(/\[Selección\].*?(\d+)\s+artículos en semana/i);
  if (m) return { phase: 1, text: `${m[1]} artículos descargados` };
  m = msg.match(/\[Filtrado temático\]\s+(\d+)\s+relevantes\s*·\s*(\d+)/i);
  if (m) return { phase: 1, text: `${m[1]} relevantes · ${m[2]} descartados` };
  m = msg.match(/\[Transformación\]\s+Extrayendo keywords de\s+(\d+)/i);
  if (m) return { phase: 2, text: `${m[1]} artículos por procesar` };
  m = msg.match(/\[(\d+)\/(\d+)\]\s+(.+?):\s+(.*)/);
  if (m) {
    const pct = Math.round((parseInt(m[1]) / parseInt(m[2])) * 100);
    return {
      phase: 2,
      text: `${m[1]} / ${m[2]} artículos procesados (${pct}%)`,
      activity: `${m[3]}: ${m[4].replace(/→.*$/, "").trim()}`
    };
  }
  m = msg.match(/\[Transformación\]\s+(\d+)\s+artículos con keywords/i);
  if (m) return { phase: 2, text: `${m[1]} artículos con keywords` };
  m = msg.match(/\[Grafo\]\s+(\d+)\s+artículos con/i);
  if (m) return { phase: 3, text: `${m[1]} artículos conectados en grafo` };
  m = msg.match(/\[Grafo\]\s+(\d+)\s+componentes/i);
  if (m) return { phase: 3, text: `${m[1]} componentes detectadas` };
  m = msg.match(/\[Filtrado\]\s+(\d+)\s+eventos válidos/i);
  if (m) return { phase: 3, text: `${m[1]} eventos válidos` };
  return null;
}

// ── Consola flotante ───────────────────────────────────────────────

function Console({ logs, running, visible, onToggle, width, height, onResize }) {
  const bottomRef = useRef(null);
  const resizeRef = useRef(null);
  const consolePanelRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  const handleResizeMouseDown = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = width;
    const startHeight = height;

    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const newWidth = Math.max(300, startWidth + deltaX);
      const newHeight = Math.max(150, startHeight + deltaY);
      onResize(newWidth, newHeight);
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  if (!logs.length) return null;

  return (
    <div
      ref={consolePanelRef}
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        width: width,
        height: height,
        zIndex: 300,
        boxShadow: "0 12px 40px rgba(0,0,0,.35)",
        fontFamily: "'SF Mono','Fira Code','Consolas',monospace",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Barra de título */}
      <div
        style={{
          background: "#1a1816",
          padding: "9px 14px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid #2a2826",
          cursor: "pointer",
          flexShrink: 0,
        }}
        onClick={onToggle}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              flexShrink: 0,
              background: running ? "#4ade80" : "#555",
              animation: running ? "kdd-pulse 1s ease-in-out infinite" : "none",
            }}
          />
          <span
            style={{
              fontSize: 10,
              color: "#666",
              letterSpacing: ".16em",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            {running ? "ejecutando" : "completado"} · pipeline log
          </span>
          <span style={{ fontSize: 11, color: "#444", marginLeft: 4 }}>
            {logs.length} líneas
          </span>
        </div>
        <span style={{ fontSize: 14, color: "#555", lineHeight: 1, userSelect: "none" }}>
          {visible ? "−" : "+"}
        </span>
      </div>

      {/* Log lines */}
      {visible && (
        <div
          style={{
            background: "#0e0d0b",
            flex: 1,
            overflowY: "auto",
            padding: "10px 14px 12px",
            position: "relative",
          }}
        >
          {logs.slice(-80).map((line, i, arr) => (
            <div
              key={i}
              style={{
                fontSize: 11,
                color: /error|fallo/i.test(line)
                  ? "#f87171"
                  : /✓|completado|guardado/i.test(line)
                    ? "#4ade80"
                    : /\[Grafo\]|\[Selección\]|\[Transformación\]/i.test(line)
                      ? "#fbbf24"
                      : "#6a6a62",
                lineHeight: 1.75,
                letterSpacing: ".01em",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                animation: i === arr.length - 1 ? "fadeInLine .18s ease forwards" : "none",
              }}
            >
              {line}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Resize handle */}
      <div
        ref={resizeRef}
        className="console-resize-handle"
        onMouseDown={handleResizeMouseDown}
        style={{
          position: "absolute",
          bottom: 0,
          right: 0,
          width: 14,
          height: 14,
          cursor: "nwse-resize",
          background: "linear-gradient(135deg, transparent 50%, rgba(120,116,104,.5) 50%)",
          opacity: 0,
          transition: "opacity .2s",
          userSelect: "none",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
      />
    </div>
  );
}

// ── Grid de 8 medios ──────────────────────────────────────────────

function MediaGrid() {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: 0,
      marginTop: 22,
      border: "1px solid var(--rule)",
    }}>
      {GROUPS.map((g, gi) => (
        <div key={g.key} style={{
          borderRight: gi < 3 ? "1px solid var(--rule)" : "none",
          padding: "14px 16px 16px",
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: ".18em",
            textTransform: "uppercase", color: g.color,
            paddingBottom: 8, marginBottom: 10,
            borderBottom: `2px solid ${g.color}`,
          }}>
            {g.label}
          </div>
          {g.medios.map(m => (
            <div key={m} style={{
              fontSize: 12, color: "var(--ink-2)",
              lineHeight: 1.9, fontWeight: 500,
            }}>
              {m}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────

const SLIDE_MS = 500;

export default function Scraper() {
  const [running, setRunning]               = useState(false);
  const [started, setStarted]               = useState(false);
  const [currentPhase, setCurrentPhase]     = useState(-1);
  const [phaseMetrics, setPhaseMetrics]     = useState({});
  const [phaseActivity, setPhaseActivity]   = useState({});
  const [isoWeek, setIsoWeek]               = useState(null);
  const [summary, setSummary]               = useState(null);
  const [error, setError]                   = useState(null);
  const [logs, setLogs]                     = useState([]);
  const [consoleVisible, setConsoleVisible] = useState(true);
  const [consoleWidth, setConsoleWidth]     = useState(() => parseInt(localStorage.getItem("consoleWidth") ?? "460"));
  const [consoleHeight, setConsoleHeight]   = useState(() => parseInt(localStorage.getItem("consoleHeight") ?? "230"));
  const phaseRef = useRef(-1);

  // Slideshow state
  const [slideIndex, setSlideIndex]           = useState(-1);
  const [prevSlideIndex, setPrevSlideIndex]   = useState(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const slidePhaseRef = useRef(-1);
  const slideTimerRef = useRef(null);

  // Bloquear scroll del body mientras estamos en esta página
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Sincronizar currentPhase → transición de slide
  useEffect(() => {
    if (currentPhase === slidePhaseRef.current) return;
    if (slideTimerRef.current) clearTimeout(slideTimerRef.current);

    const prev = slidePhaseRef.current;
    slidePhaseRef.current = currentPhase;

    setPrevSlideIndex(prev);
    setSlideIndex(currentPhase);
    setIsTransitioning(true);

    slideTimerRef.current = setTimeout(() => {
      setPrevSlideIndex(null);
      setIsTransitioning(false);
    }, SLIDE_MS);
  }, [currentPhase]);

  const handleConsoleResize = (width, height) => {
    setConsoleWidth(width);
    setConsoleHeight(height);
    localStorage.setItem("consoleWidth", width.toString());
    localStorage.setItem("consoleHeight", height.toString());
  };

  const handleRun = async () => {
    setRunning(true);
    setStarted(true);
    setCurrentPhase(0);
    phaseRef.current = 0;
    setPhaseMetrics({});
    setPhaseActivity({});
    setIsoWeek(null);
    setSummary(null);
    setError(null);
    setLogs([]);
    setConsoleVisible(true);

    try {
      const response = await runScraper();
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!response.body) throw new Error("Sin response body");

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === "log") {
              const msg = data.message || "";
              setLogs(prev => [...prev, msg]);

              const wm = msg.match(/Semana ISO\s*[:\s]+(\d{4}-W\d{2})/i);
              if (wm) setIsoWeek(wm[1]);

              const next = nextPhaseFrom(msg, phaseRef.current);
              if (next !== null) { phaseRef.current = next; setCurrentPhase(next); }

              const metric = parseMetric(msg);
              if (metric) {
                setPhaseMetrics(prev => ({ ...prev, [metric.phase]: metric.text }));
                if (metric.activity) setPhaseActivity(prev => ({ ...prev, [metric.phase]: metric.activity }));
              }

            } else if (data.type === "summary") {
              setSummary(data.data);
              phaseRef.current = 5;
              setCurrentPhase(5);
            } else if (data.type === "done") {
              setRunning(false);
            }
          } catch (_) {}
        }
      }
      setRunning(false);
    } catch (err) {
      setError(err.message);
      setRunning(false);
    }
  };

  // ── Contenido de cada slide ───────────────────────────────────

  function renderSlide(idx) {
    // ── Landing ──
    if (idx === -1) {
      return (
        <div className="phase-section-content" style={{ textAlign: "center" }}>
          <div className="kicker" style={{ marginBottom: 24 }}>
            UAZ · Ingeniería de Software · Tesis · KDD
          </div>
          <h1 style={{ fontSize: 56, fontWeight: 900, lineHeight: 1.1, letterSpacing: "-.03em", marginBottom: 28 }}>
            El mismo evento.{" "}
            <span style={{ color: "var(--rev)" }}>Tres versiones.</span>
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.8, color: "var(--ink-2)", maxWidth: 640, margin: "0 auto 48px" }}>
            Cuando el gobierno de EE.UU. acusó al gobernador de Sinaloa Rubén Rocha Moya
            de vínculos con el crimen organizado, cada periódico lo contó diferente.
            Esta herramienta automatiza el análisis de sesgo político en 8 medios mexicanos.
          </p>
          <button
            onClick={handleRun}
            disabled={running}
            style={{
              padding: "16px 48px",
              background: running ? "transparent" : "var(--ink)",
              color: running ? "var(--ink-3)" : "var(--paper)",
              border: `2px solid ${running ? "var(--rule)" : "var(--ink)"}`,
              fontWeight: 700, fontSize: 14, letterSpacing: ".12em", textTransform: "uppercase",
              cursor: running ? "wait" : "pointer", fontFamily: "inherit", transition: "all .15s",
            }}
          >
            {running ? "Ejecutando…" : started ? "Ejecutar de nuevo" : "Iniciar análisis"}
          </button>
          {isoWeek && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 32 }}>
              <span style={{
                width: 8, height: 8, borderRadius: "50%", background: "var(--rev)",
                ...(running ? { animation: "kdd-pulse 1.4s ease-in-out infinite" } : {}),
              }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)", letterSpacing: ".04em" }}>
                Semana {isoWeek}
              </span>
            </div>
          )}
          {error && (
            <div style={{ marginTop: 24, fontSize: 13, color: "var(--rev)" }}>Error: {error}</div>
          )}
        </div>
      );
    }

    // ── Resumen final ──
    if (idx >= 5) {
      return (
        <div className="phase-section-content">
          <div className="kicker" style={{ marginBottom: 36, textAlign: "center" }}>
            Resultado · Pipeline KDD completado
          </div>
          {summary && (
            <>
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 32,
                animation: "fadeInUp 550ms cubic-bezier(.4,0,.2,1) both",
              }}>
                {[
                  { label: "Eventos detectados", value: summary.eventos_detectados, color: "var(--rev)" },
                  { label: "Artículos guardados", value: summary.articulos_guardados, color: "var(--ink)" },
                  { label: "Duración total",      value: summary.duracion,           color: "var(--graphite)", mono: true },
                ].map((stat, i) => (
                  <div key={i} style={{ textAlign: "center" }}>
                    <div className="kicker" style={{ marginBottom: 14 }}>{stat.label}</div>
                    <div style={{
                      fontSize: stat.mono ? 32 : 52, fontWeight: 900, color: stat.color,
                      lineHeight: 1, letterSpacing: stat.mono ? ".04em" : "-.025em",
                      fontVariantNumeric: "tabular-nums",
                      fontFamily: stat.mono ? "'SF Mono',monospace" : "inherit",
                    }}>
                      {stat.value}
                    </div>
                  </div>
                ))}
              </div>
              {summary.articulos_fallidos > 0 && (
                <div style={{
                  marginTop: 36, padding: "14px 20px",
                  background: "var(--paper-2)", border: "1px solid var(--rule)",
                  fontSize: 14, color: "var(--ink-3)", textAlign: "center",
                }}>
                  {summary.articulos_fallidos} artículos no pudieron extraerse — sin impacto en los eventos detectados.
                </div>
              )}
              <div style={{ marginTop: 48, textAlign: "center" }}>
                <button
                  onClick={handleRun}
                  disabled={running}
                  style={{
                    padding: "12px 36px", background: "transparent", color: "var(--ink)",
                    border: "2px solid var(--ink)", fontWeight: 700, fontSize: 13,
                    letterSpacing: ".12em", textTransform: "uppercase",
                    cursor: running ? "wait" : "pointer", fontFamily: "inherit", transition: "all .15s",
                  }}
                >
                  Ejecutar de nuevo
                </button>
              </div>
            </>
          )}
        </div>
      );
    }

    // ── Fase 0–4 ──
    const phase    = PHASES[idx];
    const metric   = phaseMetrics[idx];
    const activity = phaseActivity[idx];

    return (
      <div className="phase-section-content">

        <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 28, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 12, fontWeight: 700, letterSpacing: ".22em",
            fontVariantNumeric: "tabular-nums", color: "var(--rev)",
          }}>
            {phase.num}
          </span>
          <h2 style={{ fontSize: 42, fontWeight: 900, letterSpacing: "-.025em", color: "var(--ink)", margin: 0 }}>
            {phase.label}
          </h2>
        </div>

        <p className="kicker" style={{ fontWeight: 500, letterSpacing: ".1em", marginBottom: 32 }}>
          {phase.sub}
        </p>

        <p style={{
          fontSize: 16, lineHeight: 1.8, color: "var(--ink-2)",
          maxWidth: 700, whiteSpace: "pre-line", marginBottom: 32,
        }}>
          {phase.desc}
        </p>

        {phase.showMedios && (
          <div style={{ animation: "fadeInUp 550ms cubic-bezier(.4,0,.2,1) both", marginBottom: 32 }}>
            <MediaGrid />
          </div>
        )}

        {phase.algo && (
          <pre style={{
            fontFamily: "'SF Mono','Fira Code','Consolas',monospace",
            fontSize: 13, lineHeight: 1.85, color: "var(--ink-2)",
            background: "rgba(214,40,40,.03)", border: "1px solid rgba(214,40,40,.2)",
            padding: "18px 24px", whiteSpace: "pre", overflowX: "auto",
            maxWidth: "100%", marginBottom: 32,
            animation: "fadeInUp 550ms 80ms cubic-bezier(.4,0,.2,1) both",
          }}>
            {phase.algo}
          </pre>
        )}

        {phase.detail && (
          <p style={{
            fontSize: 14, lineHeight: 1.8, color: "var(--ink-3)",
            maxWidth: 700, marginBottom: 32, whiteSpace: "pre-line",
            borderLeft: "2px solid var(--rule)", paddingLeft: 20,
            animation: "fadeInUp 550ms 60ms cubic-bezier(.4,0,.2,1) both",
          }}>
            {phase.detail}
          </p>
        )}

        {phase.rejected && (
          <div style={{ marginBottom: 32, animation: "fadeInUp 550ms 120ms cubic-bezier(.4,0,.2,1) both" }}>
            <div className="kicker" style={{ marginBottom: 18 }}>Alternativas evaluadas y descartadas</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {phase.rejected.map((r, ri) => (
                <div key={ri} style={{
                  padding: "16px 20px", border: "1px solid var(--rule)",
                  borderLeft: "3px solid var(--rule)",
                  animation: `fadeInUp 550ms ${160 + ri * 80}ms cubic-bezier(.4,0,.2,1) both`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase",
                      color: "var(--ink-3)", background: "var(--paper-2)",
                      border: "1px solid var(--rule)", padding: "3px 10px",
                    }}>
                      ✗ Descartado
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{r.name}</span>
                  </div>
                  <p style={{ fontSize: 13, lineHeight: 1.7, color: "var(--ink-3)", margin: 0 }}>{r.reason}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {metric && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 10, marginTop: 24,
            padding: "8px 18px", background: "rgba(214,40,40,.05)",
            border: "1px solid rgba(214,40,40,.2)",
            fontSize: 13, fontWeight: 600, letterSpacing: ".04em", color: "var(--rev)",
            animation: "fadeIn .3s ease",
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%", background: "var(--rev)", flexShrink: 0,
              animation: running ? "kdd-pulse 1.2s ease-in-out infinite" : "none",
            }} />
            {metric}
          </div>
        )}

        {activity && (
          <div style={{
            marginTop: 14, fontSize: 12, color: "var(--ink-3)",
            fontFamily: "'SF Mono','Fira Code',monospace",
            letterSpacing: ".02em", maxWidth: 700, animation: "fadeIn .2s ease",
          }}>
            → {activity}
          </div>
        )}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────

  const slideWrap = {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    padding: "80px",
    overflowY: "auto",
  };

  return (
    <div style={{ position: "relative", height: "calc(100vh - 76px)", overflow: "hidden", background: "var(--paper)" }}>

      {/* Slide saliente */}
      {isTransitioning && prevSlideIndex !== null && (
        <div
          key={`out-${prevSlideIndex}`}
          style={{ ...slideWrap, animation: `slideToBottom ${SLIDE_MS}ms cubic-bezier(.4,0,.2,1) forwards` }}
        >
          {renderSlide(prevSlideIndex)}
        </div>
      )}

      {/* Slide entrante / estable */}
      <div
        key={`in-${slideIndex}`}
        style={{
          ...slideWrap,
          animation: isTransitioning ? `slideFromTop ${SLIDE_MS}ms cubic-bezier(.4,0,.2,1) forwards` : "none",
        }}
      >
        {renderSlide(slideIndex)}
      </div>

      {/* Dots de progreso (fases 0–4) */}
      {slideIndex >= 0 && slideIndex < 5 && (
        <div style={{
          position: "absolute", bottom: 28, left: 0, right: 0,
          display: "flex", justifyContent: "center", gap: 10, pointerEvents: "none",
        }}>
          {PHASES.map((_, i) => (
            <span key={i} style={{
              width: 6, height: 6, borderRadius: "50%", transition: "background .3s",
              background: i < slideIndex ? "var(--ink-3)" : i === slideIndex ? "var(--rev)" : "var(--rule)",
            }} />
          ))}
        </div>
      )}

      <Console
        logs={logs}
        running={running}
        visible={consoleVisible}
        onToggle={() => setConsoleVisible(v => !v)}
        width={consoleWidth}
        height={consoleHeight}
        onResize={handleConsoleResize}
      />
    </div>
  );
}
