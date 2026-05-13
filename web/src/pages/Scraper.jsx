import { useState, useRef, useEffect } from "react";
import { runScraper } from "../api";

// ── Fases del pipeline ─────────────────────────────────────────────
const PHASES = [
  {
    id: "init",
    num: "00",
    label: "Inicialización",
    sub: "Ventana ISO · Tablas · Fuentes",
    desc: `Se establece la ventana temporal ISO — bloques fijos de lunes a domingo —
que garantiza que múltiples ejecuciones en la misma semana no generen duplicados.
La clave está en que el filtro usa la fecha de publicación del artículo (fecha_pub),
no la fecha de ejecución del pipeline. Se verifican las tablas de PostgreSQL y se
registran las 8 fuentes del espectro ideológico: 2 de izquierda, 2 críticas,
2 de centro y 2 de derecha.`,
    algo: null,
  },
  {
    id: "seleccion",
    num: "01",
    label: "Fase 1 — Selección",
    sub: "Descarga RSS · Filtrado temático",
    desc: `El sistema lee los feeds RSS de los 8 medios — archivos XML que cada
periódico actualiza automáticamente con sus artículos más recientes de secciones
de política, economía y seguridad. Se descargan hasta ~390 artículos.
Un filtro de dos pasos sobre el titular descarta deportes y entretenimiento,
y conserva solo artículos que contengan al menos una palabra de la lista
político-noticiosa. Resultado típico: ~113 artículos relevantes.`,
    algo: `# Paso 1 — Lista de exclusión
any(p in titular for p in EXCLUIR)      → descartado

# Paso 2 — Lista blanca
any(p in titular for p in RELEVANTES)   → conservado`,
  },
  {
    id: "extraccion",
    num: "02",
    label: "Fase 2 — Extracción y TF-IDF",
    sub: "Newspaper3k · Playwright · Keywords",
    desc: `Para cada artículo filtrado, Newspaper3k descarga el HTML completo y
extrae solo el cuerpo periodístico, eliminando menús, publicidad y pie de página.
Las citas directas entre comillas se eliminan para aislar el lenguaje del periodista
— no el de sus fuentes. TF-IDF convierte el cuerpo en keywords: palabras que son
frecuentes en este artículo específico pero raras en el corpus general. Esa rareza
relativa las hace únicas e identificatorias del evento que cubren.`,
    algo: `TF(t, d)  = ocurrencias(t, d) / total_palabras(d)
IDF(t)    = log( N / documentos_con_t )

TF·IDF    = TF × IDF  →  alto = keyword del evento`,
  },
  {
    id: "grafo",
    num: "03",
    label: "Fase 3 — Grafo + BFS",
    sub: "Co-ocurrencia de keywords · Clustering",
    desc: `Se construye un grafo donde cada nodo es un artículo. Para cada par de
artículos de fuentes distintas se calcula la intersección de sus keywords TF-IDF:
si comparten ≥4 keywords, se traza una arista entre ellos. Para 101 artículos
hay 5,050 comparaciones posibles; la intersección de conjuntos Python es O(min(|A|,|B|)).
BFS (Breadth-First Search) recorre el grafo y agrupa artículos en componentes
conectadas. Solo se conservan clusters con artículos de ≥3 fuentes distintas
— eso garantiza diversidad ideológica real para comparar sesgo.`,
    algo: `kw_A ∩ kw_B ≥ 4  →  arista(A, B)

BFS(grafo)  →  componentes conectadas
             cada componente = un evento`,
  },
  {
    id: "guardado",
    num: "04",
    label: "Persistencia",
    sub: "Guardado en PostgreSQL",
    desc: `Cada evento detectado y sus artículos se persisten en la base de datos.
Las keywords TF-IDF se guardan en una tabla separada (articulo_keywords) indexada
para búsquedas eficientes. El esquema es idempotente: la restricción UNIQUE en
URLs y la ventana ISO previenen duplicados aunque el pipeline se ejecute
múltiples veces en la misma semana.`,
    algo: null,
  },
];

// ── Detección de fase según patrones de log ──────────────────────
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
  if (m) return {
    phase: 2,
    text: `${m[1]} / ${m[2]} artículos procesados`,
    activity: `${m[3]}: ${m[4].replace(/→.*$/, "").trim().slice(0, 72)}`,
  };

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

// ── Limpia el prefijo de log antes de mostrar ────────────────────
function cleanLog(raw) {
  return raw
    .replace(/^\[Scraper std\w+\]\s+\S+\s+\S+\s+\[\w+\]\s*/i, "")
    .trim();
}

// ── Línea de consola — anima al montarse ─────────────────────────
function ConsoleLine({ text }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div style={{
      opacity: show ? 0.78 : 0,
      transform: show ? "translateY(0)" : "translateY(7px)",
      transition: "opacity 0.4s ease, transform 0.4s ease",
      fontSize: 11,
      lineHeight: 1.65,
      color: "#8a8272",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      fontFamily: "'SF Mono', 'Fira Code', Consolas, monospace",
    }}>
      <span style={{ color: "#d62828", marginRight: 10, userSelect: "none" }}>›</span>
      {text}
    </div>
  );
}

// ── Panel de consola flotante (derecha) ──────────────────────────
function ConsolePanel({ logs, running, visible, currentPhase }) {
  const endRef  = useRef(null);
  const [fadedPhase, setFadedPhase] = useState(currentPhase);
  const [fadeState, setFadeState]   = useState("in");
  const [wide, setWide]             = useState(
    typeof window !== "undefined" && window.innerWidth >= 1200
  );

  // Fade suave al cambiar fase
  useEffect(() => {
    if (currentPhase === fadedPhase) return;
    const t1 = setTimeout(() => setFadeState("out"), 0);
    const t2 = setTimeout(() => {
      setFadedPhase(currentPhase);
      setFadeState("in");
    }, 260);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [currentPhase, fadedPhase]);

  // Responsive: ocultar en pantallas pequeñas
  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= 1200);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Auto-scroll al fondo
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  if (!visible || !wide) return null;

  const phase = fadedPhase >= 0 && fadedPhase < PHASES.length
    ? PHASES[fadedPhase] : null;

  return (
    <div style={{
      position: "fixed",
      right: 44,
      top: "50%",
      transform: "translateY(-50%)",
      width: 540,
      height: 480,
      background: "rgba(10, 9, 7, 0.96)",
      border: `1.5px solid ${running ? "var(--rev)" : "#2a2720"}`,
      backdropFilter: "blur(12px)",
      zIndex: 200,
      transition: "border-color 0.5s ease",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>

      {/* ── Cabecera con fase actual ── */}
      <div style={{
        padding: "16px 18px 14px",
        borderBottom: "1px solid #1a1814",
        flexShrink: 0,
      }}>
        {/* Fila superior: label + dot */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
        }}>
          {running && (
            <span style={{
              width: 5, height: 5, borderRadius: "50%",
              background: "var(--rev)", flexShrink: 0,
              animation: "kdd-pulse 1.2s ease-in-out infinite",
            }} />
          )}
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: ".18em",
            textTransform: "uppercase", color: "#38342a",
            fontFamily: "'SF Mono', monospace",
          }}>
            Pipeline
          </span>
        </div>

        {/* Fase con fade al cambiar */}
        <div style={{
          opacity: fadeState === "in" ? 1 : 0,
          transform: fadeState === "in" ? "translateY(0)" : "translateY(-6px)",
          transition: "opacity 260ms cubic-bezier(.4,0,.2,1), transform 260ms cubic-bezier(.4,0,.2,1)",
          minHeight: 38,
        }}>
          {phase ? (
            <>
              <div style={{
                fontSize: 10, letterSpacing: ".14em",
                color: running ? "var(--rev)" : "#38342a",
                fontFamily: "'SF Mono', monospace",
                marginBottom: 4,
                transition: "color 0.4s ease",
              }}>
                {phase.num}
              </div>
              <div style={{
                fontSize: 12, fontWeight: 700,
                color: "#6e6860", letterSpacing: "-.01em", lineHeight: 1.35,
              }}>
                {phase.label}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: "#2e2a22", fontFamily: "'SF Mono', monospace" }}>
              —
            </div>
          )}
        </div>
      </div>

      {/* ── Líneas de log ── */}
      <div style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        overflowX: "hidden",
        padding: "10px 18px 12px",
        display: "flex", flexDirection: "column", gap: 1,
        scrollbarWidth: "thin",
        scrollbarColor: "#2a2720 transparent",
      }}>
        {logs.slice(-15).map((line, i) => (
          <ConsoleLine key={logs.length - 15 + i} text={line} />
        ))}
        <div ref={endRef} />
      </div>

      {/* ── Pie ── */}
      <div style={{
        padding: "8px 18px",
        borderTop: "1px solid #1a1814",
        fontSize: 10, color: "#2a2720",
        fontFamily: "'SF Mono', monospace",
        letterSpacing: ".1em",
        display: "flex", justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <span>{logs.length} líneas</span>
        {!running && logs.length > 0 && (
          <span style={{ color: "#38342a" }}>✓ done</span>
        )}
      </div>
    </div>
  );
}

// ── Sección de fase full-screen ───────────────────────────────────
function PhaseSection({ phase, i, state, metric, activity }) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold: 0.08, rootMargin: "0px 0px -5% 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const isActive  = state === "active";
  const isDone    = state === "complete";
  const isPending = state === "pending";

  return (
    <section
      ref={ref}
      id={`phase-${phase.id}`}
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        padding: "80px 64px",
        borderBottom: "1px solid var(--rule)",
        borderLeft: `3px solid ${isActive ? "var(--rev)" : "transparent"}`,
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(52px)",
        transition:
          "opacity 750ms cubic-bezier(.4,0,.2,1), " +
          "transform 750ms cubic-bezier(.4,0,.2,1), " +
          "border-color 0.35s ease",
        position: "relative",
      }}
    >
      <div style={{ maxWidth: 880, width: "100%" }}>

        {/* Número + línea + dot de estado */}
        <div style={{
          display: "flex", alignItems: "center", gap: 20, marginBottom: 36,
        }}>
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: ".22em",
            fontVariantNumeric: "tabular-nums",
            color: isDone ? "var(--ink-3)" : isActive ? "var(--rev)" : "var(--rule)",
            transition: "color 0.35s",
            flexShrink: 0,
          }}>
            {phase.num}
          </span>
          <div style={{
            flex: 1, height: 1,
            background: isDone ? "var(--ink-2)" : "var(--rule)",
            transition: "background 0.35s",
          }} />
          <div style={{
            width: 12, height: 12, borderRadius: "50%", flexShrink: 0,
            border: `2px solid ${isDone ? "var(--ink)" : isActive ? "var(--rev)" : "var(--rule)"}`,
            background: isDone ? "var(--ink)" : isActive ? "var(--rev)" : "transparent",
            transition: "all 0.35s",
            ...(isActive ? { boxShadow: "0 0 0 5px rgba(214,40,40,.13)" } : {}),
          }}>
            {isDone && (
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ display: "block", margin: "1px" }}>
                <polyline points="1,4 3,6 7,1.5" stroke="var(--paper)"
                  strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        </div>

        {/* Label */}
        <h2 style={{
          fontSize: "clamp(36px, 5vw, 58px)",
          fontWeight: 900,
          letterSpacing: "-.03em",
          lineHeight: 1.0,
          color: isPending ? "var(--ink-3)" : "var(--ink)",
          transition: "color 0.35s",
          marginBottom: 12,
        }}>
          {phase.label}
        </h2>

        {/* Sub */}
        <div className="kicker" style={{ marginBottom: 40, fontWeight: 500 }}>
          {phase.sub}
        </div>

        {/* Descripción */}
        <p style={{
          fontSize: 16,
          lineHeight: 1.82,
          color: isPending ? "var(--ink-3)" : "var(--ink-2)",
          maxWidth: 740,
          whiteSpace: "pre-line",
          transition: "color 0.35s",
          marginBottom: phase.algo ? 36 : 0,
        }}>
          {phase.desc}
        </p>

        {/* Bloque algoritmo */}
        {phase.algo && (
          <pre style={{
            fontFamily: "'SF Mono', 'Fira Code', Consolas, monospace",
            fontSize: 13,
            lineHeight: 2,
            color: isPending ? "var(--ink-3)" : "var(--ink-2)",
            background: isActive ? "rgba(214,40,40,.03)" : "var(--paper-2)",
            border: `1px solid ${isActive ? "rgba(214,40,40,.22)" : "var(--rule)"}`,
            padding: "22px 30px",
            whiteSpace: "pre",
            overflowX: "auto",
            maxWidth: 640,
            transition: "all 0.35s",
          }}>
            {phase.algo}
          </pre>
        )}

        {/* Métrica */}
        {metric && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 10,
            marginTop: 32,
            padding: "9px 18px",
            background: isDone ? "var(--paper-2)" : "rgba(214,40,40,.05)",
            border: `1px solid ${isDone ? "var(--rule)" : "rgba(214,40,40,.22)"}`,
            fontSize: 12, fontWeight: 700, letterSpacing: ".06em",
            color: isDone ? "var(--ink-2)" : "var(--rev)",
            transition: "all 0.3s",
          }}>
            {isActive && (
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                background: "var(--rev)",
                animation: "kdd-pulse 1.2s ease-in-out infinite",
              }} />
            )}
            {isDone ? "✓ " : ""}{metric}
          </div>
        )}

        {/* Actividad actual */}
        {isActive && activity && (
          <div style={{
            marginTop: 10,
            fontSize: 11,
            color: "var(--ink-3)",
            fontFamily: "'SF Mono', 'Fira Code', monospace",
            letterSpacing: ".02em",
            maxWidth: 700,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            → {activity}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Componente principal ──────────────────────────────────────────
export default function Scraper() {
  const [running, setRunning]           = useState(false);
  const [started, setStarted]           = useState(false);
  const [currentPhase, setCurrentPhase] = useState(-1);
  const [phaseMetrics, setPhaseMetrics] = useState({});
  const [phaseActivity, setPhaseActivity] = useState({});
  const [isoWeek, setIsoWeek]           = useState(null);
  const [summary, setSummary]           = useState(null);
  const [error, setError]               = useState(null);
  const [logs, setLogs]                 = useState([]);
  const phaseRef = useRef(-1);

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

              setLogs(prev => {
                const next = [...prev, cleanLog(msg)];
                return next.length > 300 ? next.slice(-300) : next;
              });

              const wm = msg.match(/Semana ISO\s*[:\s]+(\d{4}-W\d{2})/i);
              if (wm) setIsoWeek(wm[1]);

              const next = nextPhaseFrom(msg, phaseRef.current);
              if (next !== null) {
                phaseRef.current = next;
                setCurrentPhase(next);
              }

              const metric = parseMetric(msg);
              if (metric) {
                setPhaseMetrics(prev => ({ ...prev, [metric.phase]: metric.text }));
                if (metric.activity) {
                  setPhaseActivity(prev => ({ ...prev, [metric.phase]: metric.activity }));
                }
              }

            } else if (data.type === "summary") {
              setSummary(data.data);
              phaseRef.current = 5;
              setCurrentPhase(5);
            } else if (data.type === "done") {
              setRunning(false);
            }
          } catch (_) { /* ignorar errores de parseo */ }
        }
      }
      setRunning(false);
    } catch (err) {
      setError(err.message);
      setRunning(false);
    }
  };

  // Auto-scroll a la fase activa
  useEffect(() => {
    if (currentPhase >= 0 && currentPhase < PHASES.length) {
      setTimeout(() => {
        document.getElementById(`phase-${PHASES[currentPhase].id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 120);
    }
  }, [currentPhase]);

  const stateOf = (i) => {
    if (currentPhase === -1) return "idle";
    if (currentPhase > i)   return "complete";
    if (currentPhase === i) return "active";
    return "pending";
  };

  return (
    <div>

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        padding: "80px 64px",
        borderBottom: "1px solid var(--rule)",
      }}>
        <div>
          <div className="kicker" style={{ marginBottom: 22 }}>
            UAZ · Ingeniería de Software · Tesis · KDD
          </div>

          <h1 style={{
            fontSize: "clamp(52px, 7vw, 88px)",
            fontWeight: 900,
            lineHeight: 1.0,
            letterSpacing: "-.035em",
            color: "var(--ink)",
            marginBottom: 26,
          }}>
            Pipeline{" "}
            <em style={{ fontStyle: "italic", color: "var(--rev)" }}>KDD</em>
          </h1>

          <p style={{
            fontSize: 17,
            color: "var(--ink-2)",
            maxWidth: 520,
            lineHeight: 1.75,
            marginBottom: 56,
          }}>
            Recolección, preprocesamiento y clustering semántico de cobertura
            periodística de 8 medios mexicanos en tiempo real.
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
            <button
              onClick={handleRun}
              disabled={running}
              style={{
                padding: "15px 36px",
                background: running ? "transparent" : "var(--ink)",
                color: running ? "var(--ink-3)" : "var(--paper)",
                border: `1.5px solid ${running ? "var(--rule)" : "var(--ink)"}`,
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: ".14em",
                textTransform: "uppercase",
                cursor: running ? "wait" : "pointer",
                transition: "background .15s, color .15s, border-color .15s",
              }}
            >
              {running ? "Ejecutando…" : started ? "Ejecutar de nuevo" : "Iniciar pipeline"}
            </button>

            {isoWeek && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: "var(--rev)",
                  display: "inline-block",
                  ...(running ? { animation: "kdd-pulse 1.4s ease-in-out infinite" } : {}),
                }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)", letterSpacing: ".04em" }}>
                  Semana {isoWeek}
                </span>
              </div>
            )}

            {error && (
              <span style={{ fontSize: 13, color: "var(--rev)" }}>
                Error: {error}
              </span>
            )}
          </div>

          {/* Scroll indicator */}
          <div style={{
            marginTop: 88,
            display: "flex", alignItems: "center", gap: 16,
            color: "var(--ink-3)", fontSize: 11,
            letterSpacing: ".14em", textTransform: "uppercase", fontWeight: 600,
          }}>
            <span style={{ display: "block", width: 1, height: 36, background: "var(--rule)" }} />
            Scroll para explorar el pipeline
          </div>
        </div>
      </section>

      {/* ── FASES ────────────────────────────────────────────── */}
      {PHASES.map((phase, i) => (
        <PhaseSection
          key={phase.id}
          phase={phase}
          i={i}
          state={stateOf(i)}
          metric={phaseMetrics[i]}
          activity={phaseActivity[i]}
        />
      ))}

      {/* ── RESUMEN FINAL ─────────────────────────────────────── */}
      {summary && (
        <section style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          padding: "80px 64px",
        }}>
          <div>
            <div className="kicker" style={{ marginBottom: 40 }}>
              Resultado · Pipeline KDD completado
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", maxWidth: 760 }}>
              {[
                { label: "Eventos detectados", value: summary.eventos_detectados, color: "var(--rev)" },
                { label: "Artículos guardados", value: summary.articulos_guardados, color: "var(--ink)" },
                { label: "Duración total",      value: summary.duracion,            color: "var(--graphite)", mono: true },
              ].map((stat, idx) => (
                <div key={idx} style={{
                  padding: "8px 32px 8px 0",
                  borderRight: idx < 2 ? "1px solid var(--rule)" : "none",
                  marginRight: idx < 2 ? 32 : 0,
                }}>
                  <div className="kicker" style={{ marginBottom: 14 }}>{stat.label}</div>
                  <div style={{
                    fontSize: stat.mono ? 32 : 68,
                    fontWeight: 900,
                    color: stat.color,
                    lineHeight: 1,
                    letterSpacing: stat.mono ? ".04em" : "-.025em",
                    fontVariantNumeric: "tabular-nums",
                    fontFamily: stat.mono ? "'SF Mono', monospace" : "inherit",
                  }}>
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>

            {summary.articulos_fallidos > 0 && (
              <div style={{
                marginTop: 36,
                padding: "14px 20px",
                background: "var(--paper-2)",
                border: "1px solid var(--rule)",
                fontSize: 13, color: "var(--ink-3)",
                maxWidth: 500,
              }}>
                {summary.articulos_fallidos} artículos no pudieron extraerse — sin impacto en los eventos detectados.
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── PANEL DE CONSOLA ──────────────────────────────────── */}
      <ConsolePanel logs={logs} running={running} visible={started} currentPhase={currentPhase} />
    </div>
  );
}
