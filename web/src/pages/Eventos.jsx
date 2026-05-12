import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { getEventos, buscarEventos } from "../api";

const ORDER = ["izquierda", "critico", "centro", "derecha"];
const LIMIT = 15;

export default function Eventos() {
  const [eventos, setEventos]     = useState([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(true);
  const [query, setQuery]         = useState("");
  const [sugerencias, setSug]     = useState([]);
  const [desde, setDesde]         = useState("");
  const [hasta, setHasta]         = useState("");
  const [semana, setSemana]       = useState("");
  const searchRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    const params = { page, limit: LIMIT };
    if (desde)  params.desde  = desde;
    if (hasta)  params.hasta  = hasta;
    if (semana) params.semana = semana;
    getEventos(params)
      .then(r => { setEventos(r.data.eventos); setTotal(r.data.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, desde, hasta, semana]);

  useEffect(() => {
    if (query.length < 2) { setSug([]); return; }
    const t = setTimeout(() => {
      buscarEventos(query)
        .then(r => setSug(r.data))
        .catch(() => setSug([]));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setSug([]);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <>
      {/* HEADER */}
      <div className="page-header">
        <div>
          <div className="page-eyebrow">
            <span className="bar" />
            <span>Archivo · {total} eventos detectados</span>
          </div>
          <h1 className="page-title">
            Eventos del <em>corpus</em>.
          </h1>
          <p className="page-sub">
            Cada evento agrupa la cobertura simultánea de varios medios sobre un mismo hecho,
            ordenada por ventana temporal.
          </p>
        </div>
        <div className="page-meta">
          Total<br/>
          <b>{total.toLocaleString()} eventos</b><br/><br/>
          Página<br/>
          <b>{page} de {totalPages}</b>
        </div>
      </div>

      {/* SEARCH */}
      <div className="search-wrapper" ref={searchRef}>
        <span className="search-icon">↳</span>
        <input
          className="search-input"
          placeholder="Buscar por keyword o titular…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => query.length >= 2 && setSug(sugerencias)}
        />
        {sugerencias.length > 0 && (
          <div className="search-results">
            {sugerencias.map(s => (
              <Link
                key={s.id}
                to={`/eventos/${s.id}`}
                className="search-result-item"
                onClick={() => { setQuery(""); setSug([]); }}
              >
                <div className="search-result-title">{s.titular_evento}</div>
                <div className="search-result-meta">
                  {s.ventana_inicio?.slice(0,10)} → {s.ventana_fin?.slice(0,10)} · {s.num_fuentes} fuentes
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* FILTERS */}
      <div className="filters">
        <div className="filter-group">
          <span>Semana ISO</span>
          <input
            type="week"
            className="filter-input"
            value={semana ? semana.replace("W", "") : ""}
            onChange={e => {
              // input[type=week] retorna "2026-W20" — ya en formato correcto
              setSemana(e.target.value ? e.target.value : "");
              setPage(1);
            }}
          />
        </div>
        <div className="filter-group">
          <span>Desde</span>
          <input
            type="date"
            className="filter-input"
            value={desde}
            onChange={e => { setDesde(e.target.value); setPage(1); }}
          />
        </div>
        <div className="filter-group">
          <span>Hasta</span>
          <input
            type="date"
            className="filter-input"
            value={hasta}
            onChange={e => { setHasta(e.target.value); setPage(1); }}
          />
        </div>
        {(desde || hasta || semana) && (
          <button
            className="filter-clear"
            onClick={() => { setDesde(""); setHasta(""); setSemana(""); setPage(1); }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* LIST */}
      {loading ? (
        <div className="loading"><div className="spinner" />Cargando eventos</div>
      ) : eventos.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">∅</div>
          <div className="empty-state-text">No hay eventos que mostrar. Corre el pipeline primero.</div>
        </div>
      ) : (
        <section className="eventos-section">
          <div className="eventos-list">
            {eventos.map(ev => {
              const counts = ev.orientaciones || {};
              const tot = Object.values(counts).reduce((a, b) => a + (b || 0), 0) || 1;
              return (
                <Link to={`/eventos/${ev.id}`} key={ev.id} className="evento-card">
                  <div className="evento-card-id">#{ev.id}</div>
                  <div>
                    <div className="evento-card-title">{ev.titular_evento}</div>
                    <div className="evento-card-meta">
                      {ev.semana_iso && <span className="semana-badge">{ev.semana_iso}</span>}
                      <span>{ev.ventana_inicio?.slice(0, 10)} → {ev.ventana_fin?.slice(0, 10)}</span>
                      <span>{ev.total_articulos} artículos</span>
                      <span>{ev.fuentes_distintas} fuentes</span>
                    </div>
                    {ev.top_keywords?.length > 0 && (
                      <div className="evento-card-keywords">
                        {ev.top_keywords.slice(0, 5).map(kw => <span key={kw}>{kw}</span>)}
                      </div>
                    )}
                  </div>
                  <div className="evento-card-side">
                    <div className="evento-spec">
                      {ORDER.map(k => {
                        const v = counts[k] || 0;
                        if (!v) return null;
                        return <div key={k} style={{ flex: v / tot, background: `var(--${k})` }} />;
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

          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="page-btn nav"
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
              >← Anterior</button>
              <div className="pagination-pages">
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const p = page <= 3 ? i + 1 : page - 2 + i;
                  if (p < 1 || p > totalPages) return null;
                  return (
                    <button
                      key={p}
                      className={`page-btn ${p === page ? "active" : ""}`}
                      onClick={() => setPage(p)}
                    >{String(p).padStart(2, '0')}</button>
                  );
                })}
              </div>
              <button
                className="page-btn nav"
                disabled={page === totalPages}
                onClick={() => setPage(p => p + 1)}
              >Siguiente →</button>
            </div>
          )}
        </section>
      )}
    </>
  );
}
