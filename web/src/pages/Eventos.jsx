import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getEventos, buscarEventos } from "../api";

function fmtFecha(str) {
  if (!str) return "—";
  return new Date(str).toLocaleDateString("es-MX", { day:"2-digit", month:"short", year:"numeric" });
}

export default function Eventos() {
  const [eventos,   setEventos]   = useState([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [loading,   setLoading]   = useState(true);
  const [query,     setQuery]     = useState("");
  const [sugerencias, setSugerencias] = useState([]);
  const [desde,     setDesde]     = useState("");
  const [hasta,     setHasta]     = useState("");
  const searchRef = useRef(null);
  const navigate  = useNavigate();
  const LIMIT = 15;

  // Cargar eventos con filtros
  useEffect(() => {
    setLoading(true);
    const params = { page, limit: LIMIT };
    if (desde) params.desde = desde;
    if (hasta) params.hasta = hasta;
    getEventos(params)
      .then(r => { setEventos(r.data.eventos); setTotal(r.data.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, desde, hasta]);

  // Búsqueda en tiempo real
  useEffect(() => {
    if (query.length < 2) { setSugerencias([]); return; }
    const t = setTimeout(() => {
      buscarEventos(query)
        .then(r => setSugerencias(r.data))
        .catch(() => setSugerencias([]));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  // Cerrar sugerencias al click fuera
  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target))
        setSugerencias([]);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Eventos</div>
        <div className="page-sub">{total} eventos detectados en total</div>
      </div>

      {/* Buscador */}
      <div className="search-wrapper" ref={searchRef}>
        <span className="search-icon">🔍</span>
        <input
          className="search-input"
          placeholder="Buscar por keyword o titular..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => query.length >= 2 && setSugerencias(sugerencias)}
        />
        {sugerencias.length > 0 && (
          <div className="search-results">
            {sugerencias.map(s => (
              <Link
                key={s.id}
                to={`/eventos/${s.id}`}
                className="search-result-item"
                onClick={() => { setQuery(""); setSugerencias([]); }}
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

      {/* Filtros de fecha */}
      <div className="filters">
        <input
          type="date"
          className="filter-input"
          value={desde}
          onChange={e => { setDesde(e.target.value); setPage(1); }}
          title="Desde"
        />
        <input
          type="date"
          className="filter-input"
          value={hasta}
          onChange={e => { setHasta(e.target.value); setPage(1); }}
          title="Hasta"
        />
        {(desde || hasta) && (
          <button
            className="filter-input"
            style={{ cursor:"pointer", color:"var(--red)" }}
            onClick={() => { setDesde(""); setHasta(""); setPage(1); }}
          >
            ✕ Limpiar
          </button>
        )}
      </div>

      {/* Lista de eventos */}
      {loading ? (
        <div className="loading"><div className="spinner" />Cargando eventos...</div>
      ) : eventos.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📭</div>
          <div className="empty-state-text">No hay eventos que mostrar. Corre el pipeline primero.</div>
        </div>
      ) : (
        <>
          <div className="eventos-list">
            {eventos.map(ev => (
              <Link key={ev.id} to={`/eventos/${ev.id}`} className="evento-card">
                <div className="evento-card-title">{ev.titular_evento}</div>
                <div className="evento-card-meta">
                  <span>📅 {ev.ventana_inicio?.slice(0,10)} → {ev.ventana_fin?.slice(0,10)}</span>
                  <span>📰 {ev.total_articulos} artículos</span>
                  <span>🗂 {ev.fuentes_distintas} fuentes</span>
                  <span style={{ fontFamily:"monospace", fontSize:11 }}>#{ev.id}</span>
                </div>
                {ev.top_keywords?.length > 0 && (
                  <div className="keywords">
                    {ev.top_keywords.map(kw => (
                      <span key={kw} className="kw-chip">{kw}</span>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </div>

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="page-btn"
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
              >← Anterior</button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const p = page <= 3 ? i + 1 : page - 2 + i;
                if (p < 1 || p > totalPages) return null;
                return (
                  <button
                    key={p}
                    className={`page-btn ${p === page ? "active" : ""}`}
                    onClick={() => setPage(p)}
                  >{p}</button>
                );
              })}
              <button
                className="page-btn"
                disabled={page === totalPages}
                onClick={() => setPage(p => p + 1)}
              >Siguiente →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
