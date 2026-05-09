import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getStats } from "../api";

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getStats()
      .then(r => setStats(r.data))
      .catch(e => setError(e.message));
  }, []);

  if (error) return (
    <div className="empty-state">
      <div className="empty-state-icon">⚠️</div>
      <div className="empty-state-text">Error conectando al backend: {error}</div>
    </div>
  );

  if (!stats) return (
    <div className="loading"><div className="spinner" />Cargando estadísticas...</div>
  );

  const { totales, porFuente, topKeywords, eventosPorSemana } = stats;
  const maxArticulos = Math.max(...porFuente.map(f => parseInt(f.total)), 1);
  const maxKw        = topKeywords.length ? parseInt(topKeywords[0].frecuencia) : 1;
  const maxEv        = eventosPorSemana.length
    ? Math.max(...eventosPorSemana.map(x => parseInt(x.total_eventos)))
    : 1;

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Dashboard</div>
        <div className="page-sub">Estadísticas generales del corpus · bias_scraper</div>
      </div>

      {/* Stat cards */}
      <div className="stats-grid">
        {[
          { value: totales.total_eventos,   label: "Eventos detectados" },
          { value: totales.total_articulos, label: "Artículos recolectados" },
          { value: totales.total_fuentes,   label: "Fuentes activas" },
          { value: totales.total_keywords,  label: "Keywords únicas" },
        ].map(s => (
          <div className="stat-card" key={s.label}>
            <div className="stat-value">{Number(s.value).toLocaleString()}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        {/* Artículos por fuente */}
        <div className="card">
          <div className="card-header">Artículos por fuente</div>
          <div className="card-body">
            <div className="bar-list">
              {porFuente.map(f => (
                <div className="bar-item" key={f.nombre}>
                  <div className="bar-label">
                    <span style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <span className={`orientacion-dot dot-${f.orientacion}`} />
                      {f.nombre}
                    </span>
                    <span>{f.total}</span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{
                      width: `${(parseInt(f.total) / maxArticulos) * 100}%`,
                      background: `var(--${f.orientacion})`,
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top keywords */}
        <div className="card">
          <div className="card-header">Top keywords del corpus</div>
          <div className="card-body">
            <div className="bar-list">
              {topKeywords.map(k => (
                <div className="bar-item" key={k.keyword}>
                  <div className="bar-label">
                    <span style={{ fontFamily:"monospace" }}>{k.keyword}</span>
                    <span>{k.frecuencia}</span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{
                      width: `${(parseInt(k.frecuencia) / maxKw) * 100}%`,
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Eventos por ventana */}
      {eventosPorSemana.length > 0 && (
        <div className="card" style={{ marginBottom:"1.5rem" }}>
          <div className="card-header">Eventos por ventana temporal</div>
          <div className="card-body">
            <div className="bar-list">
              {eventosPorSemana.map(s => (
                <div className="bar-item" key={s.ventana_inicio}>
                  <div className="bar-label">
                    <span style={{ fontFamily:"monospace", fontSize:12 }}>
                      {s.ventana_inicio?.slice(0,10)} → {s.ventana_fin?.slice(0,10)}
                    </span>
                    <span>{s.total_eventos} eventos</span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{
                      width: `${(parseInt(s.total_eventos) / maxEv) * 100}%`,
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ textAlign:"center" }}>
        <Link to="/eventos" style={{ color:"var(--red)", fontSize:13, textDecoration:"none", fontWeight:500 }}>
          Ver todos los eventos →
        </Link>
      </div>
    </div>
  );
}
