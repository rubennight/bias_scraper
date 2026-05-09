import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getEvento, anotarArticulo } from "../api";

function fmtFecha(str) {
  if (!str) return "—";
  return new Date(str).toLocaleDateString("es-MX", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
  });
}

function ArticuloItem({ art, onAnotar }) {
  const [anotado, setAnotado] = useState(art.anotado || false);
  const [loading, setLoading] = useState(false);

  const toggleAnotar = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await anotarArticulo(art.id, !anotado);
      setAnotado(res.data.anotado);
      onAnotar && onAnotar(art.id, res.data.anotado);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="articulo-item">
      <div className="articulo-titular">{art.titular}</div>
      <div className="articulo-meta">
        <span className="articulo-fecha">{fmtFecha(art.fecha_pub)}</span>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          <button
            className={`btn-anotar ${anotado ? "anotado" : ""}`}
            onClick={toggleAnotar}
            disabled={loading}
          >
            {loading ? "..." : anotado ? "✓ Para anotar" : "Marcar para anotar"}
          </button>
          <a
            href={art.url}
            target="_blank"
            rel="noopener noreferrer"
            className="articulo-link"
          >
            Ver ↗
          </a>
        </div>
      </div>
      {art.keywords?.length > 0 && (
        <div className="keywords">
          {art.keywords.map(kw => (
            <span key={kw} className="kw-chip">{kw}</span>
          ))}
        </div>
      )}
    </div>
  );
}

const ORIENTACION_ORDER = ["izquierda", "critico", "centro", "derecha"];

export default function EventoDetalle() {
  const { id } = useParams();
  const [evento,  setEvento]  = useState(null);
  const [error,   setError]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getEvento(id)
      .then(r => setEvento(r.data))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="loading"><div className="spinner" />Cargando evento...</div>
  );

  if (error) return (
    <div className="empty-state">
      <div className="empty-state-icon">⚠️</div>
      <div className="empty-state-text">Error: {error}</div>
    </div>
  );

  if (!evento) return null;

  // Ordenar fuentes por orientación
  const fuentes = [...(evento.fuentes || [])].sort((a, b) => {
    return ORIENTACION_ORDER.indexOf(a.orientacion) - ORIENTACION_ORDER.indexOf(b.orientacion);
  });

  const totalAnotados = fuentes
    .flatMap(f => f.articulos)
    .filter(a => a.anotado).length;

  const totalArticulos = fuentes.flatMap(f => f.articulos).length;

  return (
    <div>
      {/* Botón volver */}
      <Link to="/eventos" className="btn-back">
        ← Volver a eventos
      </Link>

      {/* Header del evento */}
      <div className="evento-header">
        <div className="evento-titular">{evento.titular_evento}</div>

        <div className="evento-meta-row">
          <div className="evento-meta-item">
            📅
            <span className="ventana-badge">
              {evento.ventana_inicio?.slice(0,10)} → {evento.ventana_fin?.slice(0,10)}
            </span>
          </div>
          <div className="evento-meta-item">
            📰 {totalArticulos} artículos
          </div>
          <div className="evento-meta-item">
            🗂 {evento.num_fuentes} fuentes
          </div>
          {totalAnotados > 0 && (
            <div className="evento-meta-item" style={{ color:"var(--gold)" }}>
              ✓ {totalAnotados} marcados para anotar
            </div>
          )}
        </div>

        {/* Keywords del evento */}
        {evento.top_keywords?.length > 0 && (
          <div>
            <div style={{ fontSize:11, color:"var(--text-muted)", marginBottom:6, textTransform:"uppercase", letterSpacing:".05em", fontWeight:600 }}>
              Keywords del evento
            </div>
            <div className="keywords">
              {evento.top_keywords.map(kw => (
                <span key={kw} className="kw-chip highlight">{kw}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Artículos agrupados por fuente */}
      {fuentes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📭</div>
          <div className="empty-state-text">No hay artículos en este evento.</div>
        </div>
      ) : (
        <div className="fuentes-grid">
          {fuentes.map(fuente => (
            <div className="fuente-section" key={fuente.nombre}>
              <div className="fuente-header">
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span className={`orientacion-dot dot-${fuente.orientacion}`} />
                  <span className="fuente-nombre">{fuente.nombre}</span>
                </div>
                <span className={`badge badge-${fuente.orientacion}`}>
                  {fuente.orientacion}
                </span>
              </div>
              {fuente.articulos.map(art => (
                <ArticuloItem key={art.id} art={art} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
