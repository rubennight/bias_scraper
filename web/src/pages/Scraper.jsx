import { useEffect, useState, useRef } from "react";
import { runScraper } from "../api";

const LOG_LEVELS = {
  INFO:  { color: "#aaa", icon: "ℹ" },
  ERROR: { color: "#ff6b6b", icon: "✕" },
  DEBUG: { color: "#666", icon: "→" },
};

export default function Scraper() {
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const logsEndRef = useRef(null);

  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [logs]);

  const handleRun = async () => {
    setRunning(true);
    setLogs([]);
    setSummary(null);
    setError(null);

    try {
      const response = await runScraper();

      console.log("[Frontend] Response status:", response.status, "ok:", response.ok);

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        buffer += text;
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === "log") {
                setLogs(prev => [...prev, data]);
              } else if (data.type === "summary") {
                setSummary(data.data);
              } else if (data.type === "done") {
                setRunning(false);
              }
            } catch (e) {
              console.error("Error parsing SSE data:", e, "line:", line);
            }
          }
        }
      }

      // Stream terminó — asegurar que el botón se desbloquea
      setRunning(false);
    } catch (err) {
      console.error("[Frontend] Error:", err);
      setError(err.message);
      setRunning(false);
    }
  };

  const getLevelStyle = (level) => LOG_LEVELS[level] || LOG_LEVELS.INFO;

  return (
    <>
      {/* HEADER */}
      <div className="page-header">
        <div>
          <div className="page-eyebrow">
            <span className="bar" />
            <span>Automatización · Pipeline KDD</span>
          </div>
          <h1 className="page-title">
            Ejecutar <em>scraper</em>
          </h1>
          <p className="page-sub">
            Inicia el pipeline de recolección, agrupamiento y análisis de cobertura periodística.
            Monitorea el progreso en tiempo real.
          </p>
        </div>
        <div className="page-meta">
          Estado<br/>
          <b>{running ? "En ejecución" : "Listo"}</b>
        </div>
      </div>

      {/* CONTROLS */}
      <section className="sec">
        <div className="sec-head">
          <span className="sec-num">01</span>
          <h2 className="sec-title">Controles</h2>
          <span className="sec-meta">Pipeline KDD</span>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <button
            onClick={handleRun}
            disabled={running}
            style={{
              padding: "12px 24px",
              border: `1px solid var(--${running ? "rule" : "rev"})`,
              background: running ? "transparent" : "var(--rev)",
              color: running ? "var(--ink-3)" : "white",
              fontWeight: 600,
              fontSize: 14,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              cursor: running ? "wait" : "pointer",
              opacity: running ? 0.5 : 1,
              transition: "all .15s",
            }}
          >
            {running ? "Ejecutando..." : "Iniciar scraper"}
          </button>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {running ? "El proceso está en ejecución. No cierre esta página." : "Haz clic para iniciar una nueva corrida."}
          </span>
        </div>
      </section>

      {/* LOGS */}
      <section className="sec" style={{ paddingBottom: 0 }}>
        <div className="sec-head">
          <span className="sec-num">02</span>
          <h2 className="sec-title">Monitor de <em>logs</em></h2>
          <span className="sec-meta">{logs.length} líneas</span>
        </div>

        {error && (
          <div style={{
            padding: "16px",
            marginBottom: "16px",
            background: "var(--red-light)",
            border: "1px solid var(--red)",
            color: "var(--red)",
            fontSize: 13,
          }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        <div style={{
          background: "#1a1917",
          color: "#ccc",
          padding: "24px",
          fontFamily: "monospace",
          fontSize: 12,
          lineHeight: 1.6,
          maxHeight: "500px",
          overflowY: "auto",
          borderRadius: 0,
        }}>
          {logs.length === 0 ? (
            <div style={{ color: "var(--ink-3)", fontStyle: "italic" }}>
              Los logs aparecerán aquí cuando ejecutes el scraper...
            </div>
          ) : (
            logs.map((log, i) => {
              const style = getLevelStyle(log.level);
              return (
                <div key={i} style={{ color: style.color, marginBottom: 4 }}>
                  <span style={{ marginRight: 8 }}>{style.icon}</span>
                  <span>{log.timestamp}</span>
                  <span style={{ marginLeft: 8, color: "#666" }}>[{log.level}]</span>
                  <span style={{ marginLeft: 8 }}>{log.message}</span>
                </div>
              );
            })
          )}
          <div ref={logsEndRef} />
        </div>
      </section>

      {/* SUMMARY */}
      {summary && (
        <section className="sec">
          <div className="sec-head">
            <span className="sec-num">03</span>
            <h2 className="sec-title">Resumen de <em>ejecución</em></h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px" }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, marginBottom: 8 }}>
                Eventos
              </div>
              <div style={{ fontSize: 36, fontWeight: 800, color: "var(--rev)" }}>
                {summary.eventos_detectados}
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
                detectados
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, marginBottom: 8 }}>
                Artículos
              </div>
              <div style={{ fontSize: 36, fontWeight: 800, color: "var(--ink)" }}>
                {summary.articulos_guardados}
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
                guardados
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, marginBottom: 8 }}>
                Duración
              </div>
              <div style={{ fontSize: 36, fontWeight: 800, color: "var(--graphite)" }}>
                {summary.duracion}
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
                tiempo total
              </div>
            </div>
          </div>

          {summary.articulos_fallidos > 0 && (
            <div style={{ marginTop: 24, padding: 16, background: "var(--paper-2)", border: "1px solid var(--rule)" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
                ⚠ {summary.articulos_fallidos} artículos fallaron
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
                Revisa el log completo para más detalles.
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}
