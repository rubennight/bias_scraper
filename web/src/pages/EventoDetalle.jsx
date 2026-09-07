import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getEvento, anotarArticulo, getActoresEvento } from "../api";
import { ordenOrientaciones, labelOrientacion } from "../orientaciones";

function fmtFecha(str) {
  if (!str) return "—";
  return new Date(str).toLocaleDateString("es-MX", {
    day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

const TIPO_LABEL = { PER: "Personas", ORG: "Instituciones", LOC: "Lugares" };
const TIPO_COLOR = { PER: "#C0392B", ORG: "#2e7d32", LOC: "#c89a2e" };
const TIPO_BG    = { PER: "#fdf0ea", ORG: "#eef5ec", LOC: "#fef9ec" };
const ROL_LABEL  = { citado: "citado", sujeto: "sujeto", mencionado: "menc." };

function ActorChip({ actor }) {
  const [open, setOpen] = useState(false);
  const fuentes = typeof actor.fuentes_mencionan === "string"
    ? JSON.parse(actor.fuentes_mencionan)
    : actor.fuentes_mencionan || [];
  const roles = typeof actor.roles === "string"
    ? JSON.parse(actor.roles)
    : actor.roles || {};
  const rolPrincipal = Object.entries(roles).sort((x, y) => y[1] - x[1])[0];
  const color = TIPO_COLOR[actor.tipo];

  return (
    <div
      onClick={() => setOpen(!open)}
      style={{
        display: "inline-flex", flexDirection: "column",
        border: `1px solid ${open ? color : "var(--rule)"}`,
        borderRadius: 20,
        background: open ? TIPO_BG[actor.tipo] : "transparent",
        cursor: "pointer",
        transition: "all .15s",
        overflow: "hidden",
      }}
    >
      {/* chip principal */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "6px 14px 6px 10px",
      }}>
        <div style={{
          width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
          background: color,
        }} />
        <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap" }}>
          {actor.nombre_normalizado}
        </span>
        <span style={{
          fontSize: 10, color: "var(--ink-3)",
          fontWeight: 600, fontVariantNumeric: "tabular-nums",
        }}>
          {actor.total_menciones}
        </span>
        {actor.num_fuentes > 1 && (
          <span style={{
            fontSize: 9.5, padding: "1px 6px",
            background: color, color: "#fff",
            borderRadius: 10, fontWeight: 700,
          }}>
            {actor.num_fuentes}f
          </span>
        )}
      </div>

      {/* detalle expandido */}
      {open && (
        <div style={{
          padding: "0 14px 8px",
          display: "flex", flexWrap: "wrap", gap: 4,
          alignItems: "center",
        }}>
          {rolPrincipal && (
            <span style={{
              fontSize: 10, padding: "1px 7px",
              background: "var(--paper-2)", borderRadius: 10,
              color: "var(--ink-3)", fontWeight: 600,
            }}>
              {ROL_LABEL[rolPrincipal[0]] || rolPrincipal[0]}
            </span>
          )}
          {fuentes.map(f => (
            <span key={f} style={{
              fontSize: 9.5, padding: "1px 6px",
              border: "1px solid var(--rule)", borderRadius: 10,
              color: "var(--ink-3)", whiteSpace: "nowrap",
            }}>{f}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function ActoresPanel({ eventoId }) {
  const [actores, setActores]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filtro, setFiltro]       = useState(null);

  useEffect(() => {
    getActoresEvento(eventoId, { limit: 30 })
      .then(r => setActores(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [eventoId]);

  if (loading) return null;
  if (!actores.length) return null;

  const tipos = [...new Set(actores.map(a => a.tipo))];
  const filtrados = filtro ? actores.filter(a => a.tipo === filtro) : actores;

  return (
    <>
      <div className="sec-head" style={{ marginTop: 36, marginBottom: 18 }}>
        <span className="sec-num">03</span>
        <h2 className="sec-title" style={{ fontSize: 22 }}>Actores del <em>evento</em></h2>
        <span className="sec-meta">{actores.length} identificados</span>
      </div>

      {/* filtros por tipo */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        <button
          onClick={() => setFiltro(null)}
          style={{
            fontSize: 11, fontWeight: 600, fontFamily: "inherit",
            padding: "5px 14px", borderRadius: 20,
            border: `1px solid ${!filtro ? "var(--ink)" : "var(--rule)"}`,
            background: !filtro ? "var(--ink)" : "transparent",
            color: !filtro ? "var(--paper)" : "var(--ink-3)",
            cursor: "pointer", transition: "all .15s",
          }}
        >Todos</button>
        {tipos.map(t => (
          <button
            key={t}
            onClick={() => setFiltro(filtro === t ? null : t)}
            style={{
              fontSize: 11, fontWeight: 600, fontFamily: "inherit",
              padding: "5px 14px", borderRadius: 20,
              border: `1px solid ${filtro === t ? TIPO_COLOR[t] : "var(--rule)"}`,
              background: filtro === t ? TIPO_COLOR[t] : "transparent",
              color: filtro === t ? "#fff" : "var(--ink-3)",
              cursor: "pointer", transition: "all .15s",
            }}
          >{TIPO_LABEL[t]}</button>
        ))}
      </div>

      {/* chips de actores */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {filtrados.slice(0, 20).map(a => (
          <ActorChip key={a.id} actor={a} />
        ))}
      </div>
    </>
  );
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

  // Derivado de lo que realmente existe en los datos — no de una
  // lista fija de 4 orientaciones. Combina las claves de evento.fuentes
  // y las de evento.orientaciones (si el backend ya manda el agregado)
  // por si difieren, para no perder ninguna.
  const orientacionesPresentes = ordenOrientaciones([
    ...(evento.fuentes || []).map(f => f.orientacion),
    ...Object.keys(evento.orientaciones || {}),
  ]);

  const counts = evento.orientaciones || orientacionesPresentes.reduce((acc, k) => {
    acc[k] = (evento.fuentes || [])
      .filter(f => f.orientacion === k)
      .reduce((s, f) => s + (f.articulos?.length || 0), 0);
    return acc;
  }, {});
  const total = Object.values(counts).reduce((a, b) => a + (b || 0), 0) || 1;

  const fuentesByOrient = orientacionesPresentes.map(k => {
    const fuentes = (evento.fuentes || []).filter(f => f.orientacion === k);
    return {
      k,
      lab: labelOrientacion(k),
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
          {evento.resumen ? (
            <p className="evento-deck">{evento.resumen}</p>
          ) : (
            <p className="evento-deck">
              Cobertura simultánea en <b>{evento.num_fuentes} fuentes</b> con un total de
              <b> {totalArticulos} artículos</b> recolectados durante la ventana del
              <b> {evento.ventana_inicio?.slice(0,10)} al {evento.ventana_fin?.slice(0,10)}</b>.
            </p>
          )}
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
          {orientacionesPresentes.map(k => {
            const v = counts[k] || 0;
            if (!v) return null;
            return <div key={k} style={{ flex: v, height: 10, background: `var(--${k}, var(--orientacion-fallback))` }} />;
          })}
        </div>
        <div className="spec-grid">
          {orientacionesPresentes.map(k => {
            const v = counts[k] || 0;
            const pct = ((v / total) * 100).toFixed(0);
            const fuentes = fuentesByOrient.find(x => x.k === k).fuentes.length;
            return (
              <div key={k} className="spec-cell">
                <div className="top" style={{ background: `var(--${k}, var(--orientacion-fallback))`, width: 48 }} />
                <div className="lab">{labelOrientacion(k)}</div>
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

        <ActoresPanel eventoId={evento.id} />
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
              <span className="sec-num">04</span>
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
