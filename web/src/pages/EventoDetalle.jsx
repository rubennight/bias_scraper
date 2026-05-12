import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getEvento, anotarArticulo } from "../api";

const ORDER = [
  { k: "izquierda", lab: "Izquierda" },
  { k: "critico",   lab: "Crítico"   },
  { k: "centro",    lab: "Centro"    },
  { k: "derecha",   lab: "Derecha"   },
];

function fmtFecha(str) {
  if (!str) return "—";
  return new Date(str).toLocaleDateString("es-MX", {
    day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

function ArticuloItem({ art, onAnotar }) {
  const [anotado, setAnotado] = useState(!!art.anotado);
  const [loading, setLoading] = useState(false);

  const toggle = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await anotarArticulo(art.id, !anotado);
      setAnotado(res.data.anotado);
      onAnotar && onAnotar(art.id, res.data.anotado);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  return (
    <div className="articulo-item">
      <div className="articulo-titular">{art.titular}</div>
      <div className="articulo-meta">
        <span className="articulo-fecha mono">{fmtFecha(art.fecha_pub)}</span>
        <div className="articulo-actions">
          <button
            className={`btn-anotar ${anotado ? "anotado" : ""}`}
            onClick={toggle}
            disabled={loading}
          >
            {loading ? "…" : anotado ? "anotado" : "anotar"}
          </button>
          <a href={art.url} target="_blank" rel="noopener noreferrer" className="articulo-link">
            ver
          </a>
        </div>
      </div>
      {art.keywords?.length > 0 && (
        <div className="articulo-keywords">
          {art.keywords.map(kw => <span key={kw}>{kw}</span>)}
        </div>
      )}
    </div>
  );
}

export default function EventoDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [evento, setEvento]   = useState(null);
  const [error, setError]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getEvento(id)
      .then(r => setEvento(r.data))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="loading"><div className="spinner" />Cargando evento</div>
  );

  if (error) return (
    <div className="empty-state">
      <div className="empty-state-icon">!</div>
      <div className="empty-state-text">Error: {error}</div>
    </div>
  );

  if (!evento) return null;

  const counts = evento.orientaciones || ORDER.reduce((acc, o) => {
    acc[o.k] = (evento.fuentes || [])
      .filter(f => f.orientacion === o.k)
      .reduce((s, f) => s + (f.articulos?.length || 0), 0);
    return acc;
  }, {});
  const total = Object.values(counts).reduce((a, b) => a + (b || 0), 0) || 1;

  const fuentesByOrient = ORDER.map(o => {
    const fuentes = (evento.fuentes || []).filter(f => f.orientacion === o.k);
    return {
      ...o,
      fuentes,
      arts: fuentes.reduce((s, f) => s + (f.articulos?.length || 0), 0),
    };
  });

  const totalArticulos = (evento.fuentes || []).reduce((s, f) => s + (f.articulos?.length || 0), 0);
  const totalAnotados = (evento.fuentes || [])
    .flatMap(f => f.articulos || [])
    .filter(a => a.anotado).length;

  return (
    <>
      {/* CRUMB */}
      <div className="crumb">
        <button className="btn-back" onClick={() => navigate("/eventos")}>
          Volver a eventos
        </button>
        <span>
          {evento.semana_iso && (
            <span className="semana-badge" style={{ marginRight: 8 }}>{evento.semana_iso}</span>
          )}
          cluster <b style={{ color: "var(--rev)" }}>#{evento.id}</b>
          {" · "}{evento.ventana_inicio?.slice(0,10)} → {evento.ventana_fin?.slice(0,10)}
          {totalAnotados > 0 && <> · <span style={{ color: "var(--ochre)" }}>{totalAnotados} marcados</span></>}
        </span>
      </div>

      {/* HERO */}
      <section className="evento-header">
        <div>
          <div className="page-eyebrow">
            <span className="bar" />
            <span>Evento <span style={{ color: "var(--rev)", fontWeight: 800 }}>#{evento.id}</span></span>
          </div>
          <h1 className="evento-titular">{evento.titular_evento}</h1>
          <p className="evento-deck">
            Cobertura simultánea en <b>{evento.num_fuentes} fuentes</b> con un total de
            <b> {totalArticulos} artículos</b> recolectados durante la ventana del
            <b> {evento.ventana_inicio?.slice(0,10)} al {evento.ventana_fin?.slice(0,10)}</b>.
          </p>
        </div>
        <div className="meta-card">
          <div className="meta-cell">
            <div className="l">Ventana</div>
            <div className="v mono">{evento.ventana_inicio?.slice(0,10)}<br/>→ {evento.ventana_fin?.slice(0,10)}</div>
          </div>
          <div className="meta-cell">
            <div className="l">Cluster</div>
            <div className="v accent">#{evento.id}</div>
          </div>
          <div className="meta-cell">
            <div className="l">Artículos</div>
            <div className="v">{totalArticulos}</div>
          </div>
          <div className="meta-cell">
            <div className="l">Fuentes</div>
            <div className="v">{evento.num_fuentes}</div>
          </div>
        </div>
      </section>

      {/* SPECTRUM + KEYWORDS */}
      <section className="sec">
        <div className="sec-head">
          <span className="sec-num">01</span>
          <h2 className="sec-title">Distribución <em>ideológica</em></h2>
          <span className="sec-meta">n = {total} artículos</span>
        </div>
        <div className="spec-bar" style={{ height: 10 }}>
          {ORDER.map(o => {
            const v = counts[o.k] || 0;
            if (!v) return null;
            return <div key={o.k} style={{ flex: v, height: 10, background: `var(--${o.k})` }} />;
          })}
        </div>
        <div className="spec-grid">
          {ORDER.map(o => {
            const v = counts[o.k] || 0;
            const pct = ((v / total) * 100).toFixed(0);
            const fuentes = fuentesByOrient.find(x => x.k === o.k).fuentes.length;
            return (
              <div key={o.k} className="spec-cell">
                <div className="top" style={{ background: `var(--${o.k})`, width: 48 }} />
                <div className="lab">{o.lab}</div>
                <div className="num" style={{ fontSize: 32 }}>{v}</div>
                <div className="pct">{pct}% · {fuentes} fuentes</div>
              </div>
            );
          })}
        </div>

        {evento.top_keywords?.length > 0 && (
          <>
            <div className="sec-head" style={{ marginTop: 36, marginBottom: 18 }}>
              <span className="sec-num">02</span>
              <h2 className="sec-title" style={{ fontSize: 22 }}>Keywords del <em>evento</em></h2>
              <span className="sec-meta">{evento.top_keywords.length} términos</span>
            </div>
            <div className="kw-chips">
              {evento.top_keywords.map((kw, i) => (
                <span key={kw} className={`kw-chip ${i < 2 ? "highlight" : ""}`}>{kw}</span>
              ))}
            </div>
          </>
        )}
      </section>

      {/* COLUMNAS */}
      {fuentesByOrient.every(c => c.fuentes.length === 0) ? (
        <div className="empty-state">
          <div className="empty-state-icon">∅</div>
          <div className="empty-state-text">No hay artículos en este evento.</div>
        </div>
      ) : (
        <>
          <div style={{ padding: "36px 64px 0" }}>
            <div className="sec-head" style={{ paddingBottom: 24, borderBottom: "1px solid var(--rule)", marginBottom: 0 }}>
              <span className="sec-num">03</span>
              <h2 className="sec-title">Cobertura por <em>orientación</em></h2>
              <span className="sec-meta">{evento.num_fuentes} fuentes · {totalArticulos} artículos</span>
            </div>
          </div>

          <section className="fuentes-grid">
            {fuentesByOrient.map(col => (
              <div className="fuente-section" key={col.k}>
                <div className="col-head">
                  <div className="col-eyebrow">
                    <span className={`orientacion-dot dot-${col.k}`} />
                    <span className="col-lab">{col.lab}</span>
                  </div>
                  <div className="col-title">{counts[col.k] || 0}</div>
                  <div className="col-stats">
                    <span><b>{col.fuentes.length}</b>fuentes</span>
                    <span><b>{col.arts}</b>arts.</span>
                  </div>
                </div>

                {col.fuentes.length === 0 ? (
                  <div className="col-empty">Sin cobertura en esta franja.</div>
                ) : col.fuentes.map(f => (
                  <div className="fuente-card" key={f.nombre}>
                    <div className="fuente-card-head">
                      <span className="fuente-card-name">{f.nombre}</span>
                      <span className="fuente-card-count">{f.articulos.length} arts.</span>
                    </div>
                    {f.articulos.map(a => <ArticuloItem key={a.id} art={a} />)}
                  </div>
                ))}
              </div>
            ))}
          </section>
        </>
      )}
    </>
  );
}
