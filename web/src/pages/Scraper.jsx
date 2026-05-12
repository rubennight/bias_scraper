import { useState, useRef } from "react";
import { runScraper } from "../api";

// ── Definición de fases del pipeline ────────────────────────────
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

// ── Componente ────────────────────────────────────────────────────
export default function Scraper() {
  const [running, setRunning]           = useState(false);
  const [started, setStarted]           = useState(false);
  const [currentPhase, setCurrentPhase] = useState(-1);
  const [phaseMetrics, setPhaseMetrics] = useState({});
  const [phaseActivity, setPhaseActivity] = useState({});
  const [isoWeek, setIsoWeek]           = useState(null);
  const [summary, setSummary]           = useState(null);
  const [error, setError]               = useState(null);
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

              // Extraer semana ISO
              const wm = msg.match(/Semana ISO\s*[:\s]+(\d{4}-W\d{2})/i);
              if (wm) setIsoWeek(wm[1]);

              // Transición de fase
              const next = nextPhaseFrom(msg, phaseRef.current);
              if (next !== null) {
                phaseRef.current = next;
                setCurrentPhase(next);
              }

              // Métricas y actividad en tiempo real
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

  // Estado de cada fase: 'idle' | 'active' | 'complete' | 'pending'
  const stateOf = (i) => {
    if (currentPhase === -1) return "idle";
    if (currentPhase > i)    return "complete";
    if (currentPhase === i)  return "active";
    return "pending";
  };

  return (
    <div style={{ maxWidth: 780, margin: "0 auto", padding: "0 40px 100px" }}>

      {/* ── HERO ─────────────────────────────────────────────── */}
      <div style={{ paddingTop: 64, paddingBottom: 52, borderBottom: "1px solid var(--rule)", marginBottom: 72 }}>
        <div className="kicker" style={{ marginBottom: 18 }}>
          UAZ · Ingeniería de Software · Tesis · KDD
        </div>

        <h1 style={{
          fontSize: 46,
          fontWeight: 900,
          lineHeight: 1.08,
          letterSpacing: "-.025em",
          color: "var(--ink)",
          marginBottom: 16,
        }}>
          Pipeline{" "}
          <em style={{ fontStyle: "italic", color: "var(--rev)" }}>KDD</em>
        </h1>

        <p style={{ fontSize: 15, color: "var(--ink-2)", maxWidth: 500, lineHeight: 1.7, marginBottom: 36 }}>
          Recolección, preprocesamiento y clustering semántico de cobertura
          periodística de 8 medios mexicanos en tiempo real.
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
          <button
            onClick={handleRun}
            disabled={running}
            style={{
              padding: "13px 30px",
              background: running ? "transparent" : "var(--ink)",
              color: running ? "var(--ink-3)" : "var(--paper)",
              border: `1.5px solid ${running ? "var(--rule)" : "var(--ink)"}`,
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: ".12em",
              textTransform: "uppercase",
              cursor: running ? "wait" : "pointer",
              transition: "background .15s, color .15s, border-color .15s",
            }}
          >
            {running ? "Ejecutando…" : started ? "Ejecutar de nuevo" : "Iniciar pipeline"}
          </button>

          {isoWeek && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "var(--rev)",
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
      </div>

      {/* ── TIMELINE ─────────────────────────────────────────── */}
      <div>
        {PHASES.map((phase, i) => {
          const state    = stateOf(i);
          const isActive = state === "active";
          const isDone   = state === "complete";
          const isPending = state === "pending";
          const metric   = phaseMetrics[i];
          const activity = phaseActivity[i];
          const dimmed   = isPending;

          return (
            <div key={phase.id} style={{ display: "flex", gap: 0 }}>

              {/* ── Carril vertical (dot + línea) ── */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 52, flexShrink: 0, paddingTop: 3 }}>
                {/* Dot */}
                <div style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  flexShrink: 0,
                  zIndex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: `2px solid ${isDone ? "var(--ink)" : isActive ? "var(--rev)" : "var(--rule)"}`,
                  background: isDone ? "var(--ink)" : isActive ? "var(--rev)" : "transparent",
                  transition: "all .35s ease",
                  ...(isActive ? { boxShadow: "0 0 0 5px rgba(214,40,40,.12)" } : {}),
                }}>
                  {isDone && (
                    <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                      <polyline
                        points="1.5,4.5 3.5,6.5 7.5,2"
                        stroke="var(--paper)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>

                {/* Línea conectora */}
                {i < PHASES.length - 1 && (
                  <div style={{
                    width: 1,
                    flexGrow: 1,
                    minHeight: 32,
                    background: isDone ? "var(--ink-2)" : "var(--rule)",
                    marginTop: 5,
                    marginBottom: 5,
                    transition: "background .35s ease",
                  }} />
                )}
              </div>

              {/* ── Contenido de la fase ── */}
              <div style={{
                flex: 1,
                paddingLeft: 28,
                paddingBottom: i < PHASES.length - 1 ? 52 : 0,
                borderLeft: `2px solid ${isActive ? "var(--rev)" : "transparent"}`,
                marginLeft: -1,
                transition: "border-color .3s ease",
              }}>
                {/* Cabecera */}
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: ".22em",
                    fontVariantNumeric: "tabular-nums",
                    color: isDone ? "var(--ink-3)" : isActive ? "var(--rev)" : "var(--rule)",
                    transition: "color .35s",
                  }}>
                    {phase.num}
                  </span>

                  <h2 style={{
                    fontSize: 21,
                    fontWeight: 800,
                    letterSpacing: "-.015em",
                    color: dimmed ? "var(--ink-3)" : "var(--ink)",
                    transition: "color .35s",
                  }}>
                    {phase.label}
                  </h2>

                  <span className="kicker" style={{ fontWeight: 500, letterSpacing: ".1em" }}>
                    {phase.sub}
                  </span>
                </div>

                {/* Descripción */}
                <p style={{
                  fontSize: 14,
                  lineHeight: 1.75,
                  color: dimmed ? "var(--ink-3)" : "var(--ink-2)",
                  maxWidth: 620,
                  whiteSpace: "pre-line",
                  marginBottom: phase.algo ? 20 : 0,
                  transition: "color .35s",
                }}>
                  {phase.desc}
                </p>

                {/* Bloque de algoritmo */}
                {phase.algo && (
                  <pre style={{
                    fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
                    fontSize: 12,
                    lineHeight: 1.85,
                    color: dimmed ? "var(--ink-3)" : "var(--ink-2)",
                    background: isActive ? "rgba(214,40,40,.03)" : "var(--paper-2)",
                    border: `1px solid ${isActive ? "rgba(214,40,40,.18)" : "var(--rule)"}`,
                    padding: "16px 22px",
                    whiteSpace: "pre",
                    overflowX: "auto",
                    maxWidth: 560,
                    marginTop: 0,
                    transition: "all .35s",
                  }}>
                    {phase.algo}
                  </pre>
                )}

                {/* Métrica en tiempo real */}
                {metric && (
                  <div style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 18,
                    padding: "6px 14px",
                    background: isDone ? "var(--paper-2)" : "rgba(214,40,40,.05)",
                    border: `1px solid ${isDone ? "var(--rule)" : "rgba(214,40,40,.18)"}`,
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: ".04em",
                    color: isDone ? "var(--ink-2)" : "var(--rev)",
                    transition: "all .3s",
                  }}>
                    {isActive && (
                      <span style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "var(--rev)",
                        flexShrink: 0,
                        animation: "kdd-pulse 1.2s ease-in-out infinite",
                      }} />
                    )}
                    {isDone ? "✓ " : ""}
                    {metric}
                  </div>
                )}

                {/* Línea de actividad (artículo actual en fase 02) */}
                {isActive && activity && (
                  <div style={{
                    marginTop: 8,
                    fontSize: 11,
                    color: "var(--ink-3)",
                    fontFamily: "'SF Mono', 'Fira Code', monospace",
                    letterSpacing: ".02em",
                    maxWidth: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    → {activity}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── RESUMEN FINAL ─────────────────────────────────────── */}
      {summary && (
        <div style={{ marginTop: 72, paddingTop: 48, borderTop: "2px solid var(--ink)" }}>
          <div className="kicker" style={{ marginBottom: 36 }}>
            Resultado · Pipeline KDD completado
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
            {[
              { label: "Eventos detectados", value: summary.eventos_detectados, color: "var(--rev)" },
              { label: "Artículos guardados", value: summary.articulos_guardados, color: "var(--ink)" },
              { label: "Duración total",      value: summary.duracion,            color: "var(--graphite)", mono: true },
            ].map((stat, i) => (
              <div key={i} style={{
                padding: "8px 32px 8px 0",
                borderRight: i < 2 ? "1px solid var(--rule)" : "none",
                marginRight: i < 2 ? 32 : 0,
              }}>
                <div className="kicker" style={{ marginBottom: 10 }}>{stat.label}</div>
                <div style={{
                  fontSize: stat.mono ? 28 : 46,
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
              marginTop: 24,
              padding: "12px 16px",
              background: "var(--paper-2)",
              border: "1px solid var(--rule)",
              fontSize: 13,
              color: "var(--ink-3)",
            }}>
              {summary.articulos_fallidos} artículos no pudieron extraerse — sin impacto en los eventos detectados.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
