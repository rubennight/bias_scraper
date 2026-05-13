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
  if (m) return { phase: 2, text: `${m[1]} / ${m[2]} artículos procesados`, activity: `${m[3]}: ${m[4].replace(/→.*$/, "").trim().slice(0, 72)}` };
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

function Console({ logs, running, visible, onToggle }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  if (!logs.length) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: 24,
      right: 24,
      width: 460,
      zIndex: 300,
      boxShadow: "0 12px 40px rgba(0,0,0,.35)",
      fontFamily: "'SF Mono','Fira Code','Consolas',monospace",
    }}>
      {/* Barra de título */}
      <div style={{
        background: "#1a1816",
        padding: "9px 14px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        borderBottom: "1px solid #2a2826",
        cursor: "pointer",
      }} onClick={onToggle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
            background: running ? "#4ade80" : "#555",
            animation: running ? "kdd-pulse 1s ease-in-out infinite" : "none",
          }} />
          <span style={{ fontSize: 10, color: "#666", letterSpacing: ".16em", textTransform: "uppercase", fontWeight: 600 }}>
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
        <div style={{
          background: "#0e0d0b",
          maxHeight: 230,
          overflowY: "auto",
          padding: "10px 14px 12px",
        }}>
          {logs.slice(-80).map((line, i, arr) => (
            <div
              key={i}
              style={{
                fontSize: 11,
                color: /error|fallo/i.test(line) ? "#f87171"
                      : /✓|completado|guardado/i.test(line) ? "#4ade80"
                      : /\[Grafo\]|\[Selección\]|\[Transformación\]/i.test(line) ? "#fbbf24"
                      : "#6a6a62",
                lineHeight: 1.75,
                letterSpacing: ".01em",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                animation: i === arr.length - 1 ? "fadeInLine .18s ease forwards" : "none",
              }}
            >
              {line}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
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

export default function Scraper() {
  const [running, setRunning]             = useState(false);
  const [started, setStarted]             = useState(false);
  const [currentPhase, setCurrentPhase]   = useState(-1);
  const [phaseMetrics, setPhaseMetrics]   = useState({});
  const [phaseActivity, setPhaseActivity] = useState({});
  const [isoWeek, setIsoWeek]             = useState(null);
  const [summary, setSummary]             = useState(null);
  const [error, setError]                 = useState(null);
  const [logs, setLogs]                   = useState([]);
  const [consoleVisible, setConsoleVisible] = useState(true);
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

  const stateOf = (i) => {
    if (currentPhase === -1) return "idle";
    if (currentPhase > i)    return "complete";
    if (currentPhase === i)  return "active";
    return "pending";
  };

  return (
    <div>

      {/* ════════════════════════════════════════════════════════
          SECCIÓN 1 — El problema: el mismo hecho, 3 versiones
          ════════════════════════════════════════════════════════ */}
      <section style={{ padding: "72px 80px 64px", borderBottom: "1px solid var(--rule)" }}>
        <div className="kicker" style={{ marginBottom: 18 }}>
          UAZ · Ingeniería de Software · Tesis · KDD
        </div>

        <h1 style={{
          fontSize: 52,
          fontWeight: 900,
          lineHeight: 1.05,
          letterSpacing: "-.03em",
          marginBottom: 20,
          maxWidth: 620,
        }}>
          El mismo evento.{" "}
          <em style={{ color: "var(--rev)", fontStyle: "italic" }}>Tres versiones.</em>
        </h1>

        <p style={{ fontSize: 15, lineHeight: 1.7, color: "var(--ink-2)", maxWidth: 540, marginBottom: 48 }}>
          Cuando el gobierno de EE.UU. acusó al gobernador de Sinaloa Rubén Rocha Moya
          de vínculos con el crimen organizado, cada periódico lo contó diferente.
        </p>

        {/* Las tres portadas */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0, marginBottom: 36, maxWidth: 780 }}>
          {[
            { medio: "La Jornada", color: "var(--rev)", orientacion: "Izquierda",
              titular: '"En un momento de tensión injustificada con Washington…"',
              capa: "tensión injustificada" },
            { medio: "El Financiero", color: "var(--ochre)", orientacion: "Crítico",
              titular: '"La acusación pone en aprietos a Sheinbaum"',
              capa: "en aprietos" },
            { medio: "Animal Político", color: "var(--graphite)", orientacion: "Centro",
              titular: '"La sombra del Cártel de Sinaloa alcanza a Morena"',
              capa: "sombra del cártel" },
          ].map((item, i) => (
            <div key={i} style={{
              borderLeft: `3px solid ${item.color}`,
              borderRight: i < 2 ? "1px solid var(--rule)" : "none",
              padding: "18px 22px",
              background: "var(--paper-2)",
            }}>
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: ".18em",
                textTransform: "uppercase", color: item.color, marginBottom: 6,
              }}>
                {item.medio}
                <span style={{ color: "var(--ink-3)", fontWeight: 500, marginLeft: 8 }}>
                  · {item.orientacion}
                </span>
              </div>
              <div style={{
                fontSize: 13, lineHeight: 1.6, color: "var(--ink)",
                fontWeight: 500, marginBottom: 14, fontStyle: "italic",
              }}>
                {item.titular}
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", borderTop: "1px solid var(--rule)", paddingTop: 10 }}>
                Capa ideológica:{" "}
                <span style={{ color: item.color, fontWeight: 700 }}>"{item.capa}"</span>
              </div>
            </div>
          ))}
        </div>

        {/* El hecho material */}
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 16,
          padding: "20px 24px",
          background: "var(--ink)", color: "var(--paper)",
          maxWidth: 680,
        }}>
          <div style={{ width: 3, minHeight: 44, background: "var(--rev)", flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 14, lineHeight: 1.7 }}>
            <strong>El hecho material es uno:</strong> hubo una acusación formal.{" "}
            Todo lo demás —<em style={{ color: "rgba(244,239,229,.6)" }}>"tensión injustificada"</em>,{" "}
            <em style={{ color: "rgba(244,239,229,.6)" }}>"en aprietos"</em>,{" "}
            <em style={{ color: "rgba(244,239,229,.6)" }}>"sombra del cártel"</em>—{" "}
            son capas ideológicas que cada medio agrega según su posición política.
          </p>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          SECCIÓN 2 — La contribución original + estado KDD
          ════════════════════════════════════════════════════════ */}
      <section style={{
        padding: "56px 80px",
        borderBottom: "1px solid var(--rule)",
        display: "grid",
        gridTemplateColumns: "1.1fr 1fr",
        gap: 72,
        alignItems: "flex-start",
      }}>
        <div>
          <div className="kicker" style={{ marginBottom: 16 }}>La contribución original</div>
          <h2 style={{
            fontSize: 28, fontWeight: 800, letterSpacing: "-.02em",
            lineHeight: 1.2, marginBottom: 18,
          }}>
            Todos los sistemas{" "}
            <span style={{ color: "var(--rev)" }}>detectan</span> sesgo.
            <br />
            Ninguno puede{" "}
            <span style={{ color: "var(--rev)" }}>separarlo</span>.
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.8, color: "var(--ink-2)", maxWidth: 440 }}>
            El estado del arte puede decir "este artículo tiene sesgo político".
            Lo que no puede hacer es responder: ¿cuál es el hecho factual de base
            y qué fue añadido por el periodista?
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.8, color: "var(--ink-2)", maxWidth: 440, marginTop: 12 }}>
            Esa separación — hecho material vs. capa ideológica — es exactamente
            lo que construye esta metodología KDD sobre 8 medios del espectro mexicano.
          </p>
        </div>

        {/* Estado de las 6 fases KDD */}
        <div style={{ borderLeft: "1px solid var(--rule)", paddingLeft: 64 }}>
          <div className="kicker" style={{ marginBottom: 16 }}>Estado del pipeline KDD</div>
          {[
            { num: "01", label: "Selección de datos",  done: true  },
            { num: "02", label: "Preprocesamiento",    done: true  },
            { num: "03", label: "Transformación",      done: true  },
            { num: "04", label: "Anotación",           done: false, next: true },
            { num: "05", label: "Minería",             done: false },
            { num: "06", label: "Interpretación",      done: false },
          ].map((p) => (
            <div key={p.num} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "10px 0", borderBottom: "1px solid var(--rule)",
              opacity: p.done || p.next ? 1 : 0.38,
            }}>
              <span style={{
                width: 20, height: 20, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: p.done ? "var(--ink)" : "transparent",
                border: `1.5px solid ${p.done ? "var(--ink)" : p.next ? "var(--rev)" : "var(--rule)"}`,
                flexShrink: 0, fontSize: 9, color: "var(--paper)", fontWeight: 700,
              }}>
                {p.done ? "✓" : ""}
              </span>
              <span style={{
                fontSize: 13, flex: 1,
                fontWeight: p.done || p.next ? 600 : 400,
                color: p.done ? "var(--ink)" : p.next ? "var(--rev)" : "var(--ink-3)",
              }}>
                {p.num} — {p.label}
              </span>
              {p.next && (
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: ".14em",
                  textTransform: "uppercase", color: "var(--rev)",
                }}>
                  Siguiente
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          SECCIÓN 3 — Pipeline: botón + timeline + consola
          ════════════════════════════════════════════════════════ */}
      <div style={{ maxWidth: 840, margin: "0 auto", padding: "72px 40px 120px" }}>

        {/* Botón + indicador de semana */}
        <div style={{
          display: "flex", alignItems: "center", gap: 28,
          marginBottom: 72, paddingBottom: 40,
          borderBottom: "2px solid var(--ink)",
          flexWrap: "wrap",
        }}>
          <button
            onClick={handleRun}
            disabled={running}
            style={{
              padding: "14px 34px",
              background: running ? "transparent" : "var(--ink)",
              color: running ? "var(--ink-3)" : "var(--paper)",
              border: `1.5px solid ${running ? "var(--rule)" : "var(--ink)"}`,
              fontWeight: 700, fontSize: 12,
              letterSpacing: ".12em", textTransform: "uppercase",
              cursor: running ? "wait" : "pointer",
              fontFamily: "inherit",
              transition: "all .15s",
            }}
          >
            {running ? "Ejecutando…" : started ? "Ejecutar de nuevo" : "Iniciar pipeline"}
          </button>

          {isoWeek && (
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
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
            <span style={{ fontSize: 13, color: "var(--rev)" }}>Error: {error}</span>
          )}
        </div>

        {/* ── TIMELINE ──────────────────────────────────── */}
        <div>
          {PHASES.map((phase, i) => {
            const state    = stateOf(i);
            const isActive  = state === "active";
            const isDone    = state === "complete";
            const isPending = state === "pending";
            const isIdle    = state === "idle";
            const dimmed    = isPending;
            const metric    = phaseMetrics[i];
            const activity  = phaseActivity[i];

            return (
              <div key={phase.id} style={{ display: "flex", gap: 0 }}>

                {/* Dot + línea vertical */}
                <div style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  width: 52, flexShrink: 0, paddingTop: 3,
                }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: "50%",
                    flexShrink: 0, zIndex: 1,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: `2px solid ${isDone ? "var(--ink)" : isActive ? "var(--rev)" : "var(--rule)"}`,
                    background: isDone ? "var(--ink)" : isActive ? "var(--rev)" : "transparent",
                    transition: "all .35s ease",
                    ...(isActive ? { boxShadow: "0 0 0 6px rgba(214,40,40,.1)" } : {}),
                  }}>
                    {isDone && (
                      <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                        <polyline points="1.5,4.5 3.5,6.5 7.5,2"
                          stroke="var(--paper)" strokeWidth="1.5"
                          strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  {i < PHASES.length - 1 && (
                    <div style={{
                      width: 1, flexGrow: 1, minHeight: 32,
                      background: isDone ? "var(--ink-2)" : "var(--rule)",
                      marginTop: 5, marginBottom: 5,
                      transition: "background .35s ease",
                    }} />
                  )}
                </div>

                {/* Contenido de la fase */}
                <div style={{
                  flex: 1, paddingLeft: 28,
                  paddingBottom: i < PHASES.length - 1 ? 60 : 0,
                  borderLeft: `2px solid ${isActive ? "var(--rev)" : "transparent"}`,
                  marginLeft: -1,
                  transition: "border-color .3s ease",
                }}>

                  {/* Cabecera */}
                  <div style={{
                    display: "flex", alignItems: "baseline", gap: 12,
                    marginBottom: 16, flexWrap: "wrap",
                  }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, letterSpacing: ".22em",
                      fontVariantNumeric: "tabular-nums",
                      color: isDone ? "var(--ink-3)" : isActive ? "var(--rev)" : "var(--rule)",
                      transition: "color .35s",
                    }}>
                      {phase.num}
                    </span>
                    <h2 style={{
                      fontSize: 21, fontWeight: 800, letterSpacing: "-.015em",
                      color: dimmed ? "var(--ink-3)" : "var(--ink)",
                      transition: "color .35s",
                    }}>
                      {phase.label}
                    </h2>
                    <span className="kicker" style={{ fontWeight: 500, letterSpacing: ".1em" }}>
                      {phase.sub}
                    </span>
                  </div>

                  {/* Descripción base — siempre visible */}
                  <p style={{
                    fontSize: 14, lineHeight: 1.78,
                    color: dimmed ? "var(--ink-3)" : "var(--ink-2)",
                    maxWidth: 630, whiteSpace: "pre-line",
                    transition: "color .35s",
                    marginBottom: 0,
                  }}>
                    {phase.desc}
                  </p>

                  {/* Grid de 8 medios — Fase 01 siempre */}
                  {phase.showMedios && (
                    <div style={{
                      animation: isActive ? "fadeInUp .45s ease both" : "none",
                    }}>
                      <MediaGrid />
                    </div>
                  )}

                  {/* Bloque de algoritmo — siempre visible si existe */}
                  {phase.algo && (
                    <pre style={{
                      fontFamily: "'SF Mono','Fira Code','Consolas',monospace",
                      fontSize: 12, lineHeight: 1.85,
                      color: dimmed ? "var(--ink-3)" : "var(--ink-2)",
                      background: isActive ? "rgba(214,40,40,.03)" : "var(--paper-2)",
                      border: `1px solid ${isActive ? "rgba(214,40,40,.2)" : "var(--rule)"}`,
                      padding: "16px 22px",
                      whiteSpace: "pre",
                      overflowX: "auto",
                      maxWidth: 580,
                      marginTop: 22,
                      transition: "all .35s",
                      animation: isActive ? "fadeInUp .45s .1s ease both" : "none",
                    }}>
                      {phase.algo}
                    </pre>
                  )}

                  {/* Detalle expandido — aparece al activarse */}
                  {(isActive || isDone) && phase.detail && (
                    <p
                      key={`detail-${state}`}
                      style={{
                        fontSize: 13, lineHeight: 1.8, color: "var(--ink-3)",
                        maxWidth: 620, marginTop: 18,
                        whiteSpace: "pre-line",
                        borderLeft: "2px solid var(--rule)",
                        paddingLeft: 16,
                        animation: "fadeInUp .4s .05s ease both",
                      }}
                    >
                      {phase.detail}
                    </p>
                  )}

                  {/* Alternativas descartadas — Fase 03, solo cuando activa o completa */}
                  {phase.rejected && (isActive || isDone) && (
                    <div style={{ marginTop: 22, animation: "fadeInUp .45s .15s ease both" }}>
                      <div className="kicker" style={{ marginBottom: 12 }}>
                        Alternativas evaluadas y descartadas
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {phase.rejected.map((r, ri) => (
                          <div key={ri} style={{
                            padding: "14px 18px",
                            border: "1px solid var(--rule)",
                            borderLeft: "3px solid var(--rule)",
                            animation: `fadeInUp .4s ${.2 + ri * .1}s ease both`,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                              <span style={{
                                fontSize: 10, fontWeight: 700, letterSpacing: ".12em",
                                textTransform: "uppercase", color: "var(--ink-3)",
                                background: "var(--paper-2)", border: "1px solid var(--rule)",
                                padding: "2px 8px",
                              }}>
                                ✗ Descartado
                              </span>
                              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>
                                {r.name}
                              </span>
                            </div>
                            <p style={{ fontSize: 12, lineHeight: 1.7, color: "var(--ink-3)", maxWidth: 560 }}>
                              {r.reason}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Métrica en tiempo real */}
                  {metric && (
                    <div
                      key={`metric-${metric}`}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 8,
                        marginTop: 18, padding: "6px 14px",
                        background: isDone ? "var(--paper-2)" : "rgba(214,40,40,.05)",
                        border: `1px solid ${isDone ? "var(--rule)" : "rgba(214,40,40,.2)"}`,
                        fontSize: 12, fontWeight: 600, letterSpacing: ".04em",
                        color: isDone ? "var(--ink-2)" : "var(--rev)",
                        transition: "all .3s",
                        animation: "fadeIn .3s ease",
                      }}
                    >
                      {isActive && (
                        <span style={{
                          width: 6, height: 6, borderRadius: "50%",
                          background: "var(--rev)", flexShrink: 0,
                          animation: "kdd-pulse 1.2s ease-in-out infinite",
                        }} />
                      )}
                      {isDone ? "✓ " : ""}
                      {metric}
                    </div>
                  )}

                  {/* Línea de actividad en tiempo real (artículo procesándose) */}
                  {isActive && activity && (
                    <div style={{
                      marginTop: 8, fontSize: 11, color: "var(--ink-3)",
                      fontFamily: "'SF Mono','Fira Code',monospace",
                      letterSpacing: ".02em", maxWidth: 620,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      animation: "fadeIn .2s ease",
                    }}>
                      → {activity}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── RESUMEN FINAL ─────────────────────────────── */}
        {summary && (
          <div style={{
            marginTop: 72, paddingTop: 48,
            borderTop: "2px solid var(--ink)",
            animation: "fadeInUp .5s ease both",
          }}>
            <div className="kicker" style={{ marginBottom: 36 }}>
              Resultado · Pipeline KDD completado
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
              {[
                { label: "Eventos detectados", value: summary.eventos_detectados, color: "var(--rev)" },
                { label: "Artículos guardados", value: summary.articulos_guardados, color: "var(--ink)" },
                { label: "Duración total", value: summary.duracion, color: "var(--graphite)", mono: true },
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
                    fontFamily: stat.mono ? "'SF Mono',monospace" : "inherit",
                    animation: "fadeInUp .4s ease both",
                  }}>
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>

            {summary.articulos_fallidos > 0 && (
              <div style={{
                marginTop: 24, padding: "12px 16px",
                background: "var(--paper-2)", border: "1px solid var(--rule)",
                fontSize: 13, color: "var(--ink-3)",
              }}>
                {summary.articulos_fallidos} artículos no pudieron extraerse — sin impacto en los eventos detectados.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── CONSOLA FLOTANTE ──────────────────────────── */}
      <Console
        logs={logs}
        running={running}
        visible={consoleVisible}
        onToggle={() => setConsoleVisible(v => !v)}
      />
    </div>
  );
}
