import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { getStats, getEventos } from "../api";

const ORDER = [
  { k: "izquierda", lab: "Izquierda" },
  { k: "critico",   lab: "Crítico"   },
  { k: "centro",    lab: "Centro"    },
  { k: "derecha",   lab: "Derecha"   },
];

const ROTATE_MS = 6000;
const FADE_MS   = 550;

function Spectrum({ counts }) {
  const total = ORDER.reduce((s, o) => s + (counts?.[o.k] || 0), 0) || 1;
  return (
    <div>
      <div className="spec-head">
        <span>Distribución de cobertura</span>
        <span>n = {total}</span>
      </div>
      <div className="spec-bar">
        {ORDER.map(o => {
          const v = counts?.[o.k] || 0;
          if (!v) return null;
          return <div key={o.k} style={{ flex: v, background: `var(--${o.k})` }} />;
        })}
      </div>
      <div className="spec-grid">
        {ORDER.map(o => {
          const v = counts?.[o.k] || 0;
          const pct = ((v / total) * 100).toFixed(0);
          return (
            <div key={o.k} className="spec-cell">
              <div className="top" style={{ background: `var(--${o.k})` }} />
              <div className="lab">{o.lab}</div>
              <div className="num">{v}</div>
              <div className="pct">{pct}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState(null);

  // rotación de evento en foco
  const [leadIdx, setLeadIdx] = useState(0);
  const [phase, setPhase] = useState("in");
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const startRef = useRef(performance.now());

  useEffect(() => {
    getStats()
      .then(r => setStats(r.data))
      .catch(e => setError(e.message));
    getEventos({ page: 1, limit: 5 })
      .then(r => setRecent(r.data.eventos || []))
      .catch(() => {});
  }, []);

  // progreso suave + auto-avance
  useEffect(() => {
    if (!recent.length) return;
    let raf;
    const tick = (t) => {
      if (!paused && phase === "in") {
        const elapsed = t - startRef.current;
        const p = Math.min(elapsed / ROTATE_MS, 1);
        setProgress(p);
        if (p >= 1) setPhase("out");
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, paused, recent.length]);

  // swap al terminar fade
  useEffect(() => {
    if (phase !== "out") return;
    const t = setTimeout(() => {
      setLeadIdx(i => (i + 1) % Math.max(recent.length, 1));
      startRef.current = performance.now();
      setProgress(0);
      setPhase("in");
    }, FADE_MS);
    return () => clearTimeout(t);
  }, [phase, recent.length]);

  const goTo = (i) => {
    if (i === leadIdx || phase === "out") return;
    setPhase("out");
    setTimeout(() => {
      setLeadIdx(i);
      startRef.current = performance.now();
      setProgress(0);
      setPhase("in");
    }, FADE_MS);
  };

  if (error) return (
    <div className="empty-state">
      <div className="empty-state-icon">!</div>
      <div className="empty-state-text">Error conectando al backend: {error}</div>
    </div>
  );

  if (!stats) return (
    <div className="loading"><div className="spinner" />Cargando estadísticas</div>
  );

  const { totales, porFuente, topKeywords } = stats;
  const maxF = Math.max(...porFuente.map(f => parseInt(f.total)), 1);
  const lead = recent[leadIdx];

  return (
    <>
      {/* HEADER */}
      <div className="page-header">
        <div>
          <div className="page-eyebrow">
            <span className="bar" />
            <span>Estado del corpus · {new Date().toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}</span>
          </div>
          <h1 className="page-title">
            Una lectura comparada<br/>
            de la <em>prensa mexicana</em>.
          </h1>
          <p className="page-sub">
            Recolección, agrupamiento y análisis de la cobertura periodística sobre un mismo
            hecho, a través de fuentes distribuidas en el espectro ideológico.
          </p>
        </div>
        <div className="page-meta">
          Última corrida<br/>
          <b>Hoy</b>
        </div>
      </div>

      {/* STATS */}
      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Eventos</div>
          <div className="stat-value accent">{Number(totales.total_eventos).toLocaleString()}</div>
          <div className="stat-foot">detectados en el corpus</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Artículos</div>
          <div className="stat-value">{Number(totales.total_articulos).toLocaleString()}</div>
          <div className="stat-foot">recolectados</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Fuentes activas</div>
          <div className="stat-value">{Number(totales.total_fuentes).toLocaleString()}</div>
          <div className="stat-foot">en el espectro</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Keywords únicas</div>
          <div className="stat-value">{Number(totales.total_keywords).toLocaleString()}</div>
          <div className="stat-foot">extraídas</div>
        </div>
      </section>

      {/* LEAD EVENT (rotación) */}
      {lead && (
        <section className="sec">
          <div className="sec-head">
            <span className="sec-num">01</span>
            <h2 className="sec-title">Evento <em>en foco</em></h2>
            <span className="sec-meta">cluster #{lead.id}</span>
          </div>

          <div className="lead"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
          >
            <div className={`lead-fade ${phase}`}>
              <div className="lead-eyebrow">
                <span className="id">#{lead.id}</span>
                <span>·</span>
                <span>{lead.ventana_inicio?.slice(0,10)} → {lead.ventana_fin?.slice(0,10)}</span>
              </div>
              <h3 className="lead-headline">
                <Link to={`/eventos/${lead.id}`}>{lead.titular_evento}</Link>
              </h3>
              <p className="lead-deck">
                Cobertura simultánea en <b>{lead.fuentes_distintas} fuentes</b> con un total de
                <b> {lead.total_articulos} artículos</b> durante la ventana.
                {lead.top_keywords?.length > 0 && <> Términos predominantes: <b>{lead.top_keywords.slice(0,3).join(", ")}</b>.</>}
              </p>
            </div>
            <div className={`lead-fade ${phase}`}>
              <Spectrum counts={lead.orientaciones || {}} />
            </div>

            <div className="lead-rail">
              <span className="lead-counter">
                <b>{String(leadIdx + 1).padStart(2, '0')}</b> / {String(recent.length).padStart(2, '0')}
              </span>
              <div className="lead-prog">
                <div className="fill" style={{ width: `${progress * 100}%` }} />
              </div>
              <div className="lead-dots">
                {recent.map((_, i) => (
                  <button
                    key={i}
                    className={`lead-dot ${i === leadIdx ? "active" : ""}`}
                    onClick={() => goTo(i)}
                    aria-label={`Evento ${i + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* FUENTES + KEYWORDS */}
      <section className="row-2">
        <div>
          <div className="sec-head">
            <span className="sec-num">02</span>
            <h2 className="sec-title">Por <em>fuente</em></h2>
            <span className="sec-meta">{porFuente.length} activas</span>
          </div>
          <div className="fuentes-list">
            {porFuente.map(f => (
              <div className="fuente-row" key={f.nombre}>
                <div className="fuente-head">
                  <span className={`orientacion-dot dot-${f.orientacion}`} />
                  <span className="fuente-name">{f.nombre}</span>
                </div>
                <span className="fuente-num">{f.total}</span>
                <div className="fuente-track">
                  <div className="fuente-fill" style={{
                    width: `${(parseInt(f.total) / maxF) * 100}%`,
                    background: `var(--${f.orientacion})`,
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="sec-head">
            <span className="sec-num">03</span>
            <h2 className="sec-title">Léxico <em>predominante</em></h2>
            <span className="sec-meta">top {topKeywords.length}</span>
          </div>
          <div className="kw-list">
            {topKeywords.map((k, i) => (
              <div className="kw-row" key={k.keyword}>
                <span className="kw-rank">{String(i + 1).padStart(2, '0')}</span>
                <span className="kw-word">{k.keyword}</span>
                <span className="kw-num">{k.frecuencia}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* RECENT EVENTS */}
      {recent.length > 0 && (
        <section className="eventos-section">
          <div className="sec-head">
            <span className="sec-num">04</span>
            <h2 className="sec-title">Eventos <em>recientes</em></h2>
            <span className="sec-meta">{recent.length} de {totales.total_eventos}</span>
          </div>
          <div className="eventos-list">
            {recent.map(ev => {
              const counts = ev.orientaciones || {};
              const tot = Object.values(counts).reduce((a, b) => a + (b || 0), 0) || 1;
              return (
                <Link to={`/eventos/${ev.id}`} key={ev.id} className="evento-card">
                  <div className="evento-card-id">#{ev.id}</div>
                  <div>
                    <div className="evento-card-title">{ev.titular_evento}</div>
                    <div className="evento-card-meta">
                      <span>{ev.ventana_inicio?.slice(0, 10)} → {ev.ventana_fin?.slice(0, 10)}</span>
                      <span>{ev.total_articulos} artículos</span>
                      <span>{ev.fuentes_distintas} fuentes</span>
                    </div>
                  </div>
                  <div className="evento-card-side">
                    <div className="evento-spec">
                      {ORDER.map(o => {
                        const v = counts[o.k] || 0;
                        if (!v) return null;
                        return <div key={o.k} style={{ flex: v / tot, background: `var(--${o.k})` }} />;
                      })}
                    </div>
                    <div className="evento-counts">
                      <span><b>{ev.total_articulos}</b>arts.</span>
                      <span><b>{ev.fuentes_distintas}</b>fuentes</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
          <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid var(--rule)", textAlign: "right" }}>
            <Link to="/eventos" style={{
              fontSize: 12, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase",
              color: "var(--rev)", borderBottom: "1px solid var(--rev)", paddingBottom: 2,
            }}>
              Ver todos los eventos →
            </Link>
          </div>
        </section>
      )}
    </>
  );
}
