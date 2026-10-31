import { useState, useEffect } from "react";
import {
  getSolicitudes, getAnotadores, aprobarSolicitud, rechazarSolicitud,
} from "../api";

const ESTADOS = [
  { id: "pendiente", label: "Pendientes" },
  { id: "aprobado",  label: "Aprobadas" },
  { id: "rechazado", label: "Rechazadas" },
];

// Avisa a la barra de navegación para que refresque el contador.
const avisarCambio = () => window.dispatchEvent(new Event("solicitudes-actualizadas"));

function TarjetaSolicitud({ sol, anotadores, onCambio }) {
  const [vinculo, setVinculo]       = useState("");
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo]         = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError]           = useState("");

  const ejecutar = async (accion) => {
    setTrabajando(true);
    setError("");
    try {
      await accion();
      avisarCambio();
      onCambio();
    } catch (e) {
      setError(e.response?.data?.error || "No se pudo completar la acción");
      setTrabajando(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{sol.nombre_completo}</div>
          <div style={{ fontSize: 13, color: "var(--ink-2)" }}>{sol.email} · {sol.celular}</div>
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
            Solicitó el {new Date(sol.creado_en).toLocaleString("es-MX")}
            {sol.estado === "rechazado" && sol.motivo_rechazo && <> · Motivo: {sol.motivo_rechazo}</>}
          </div>
        </div>

        {sol.estado === "pendiente" && (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select className="filter-input" value={vinculo} onChange={e => setVinculo(e.target.value)}>
                <option value="">Crear perfil de anotador nuevo</option>
                {anotadores.map(a => (
                  <option key={a.id} value={a.id}>Vincular a: {a.nombre}</option>
                ))}
              </select>
              <button className="filter-clear" disabled={trabajando}
                style={{ background: "var(--ink)", color: "var(--paper)" }}
                onClick={() => ejecutar(() => aprobarSolicitud(sol.id, vinculo))}>
                Aprobar
              </button>
              {!rechazando && (
                <button className="filter-clear" disabled={trabajando} onClick={() => setRechazando(true)}>
                  Rechazar
                </button>
              )}
            </div>

            {rechazando && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input className="filter-input" style={{ flex: 1, minWidth: 200 }} value={motivo}
                  onChange={e => setMotivo(e.target.value)} placeholder="Motivo (opcional)" />
                <button className="filter-clear" disabled={trabajando}
                  style={{ color: "var(--rev)" }}
                  onClick={() => ejecutar(() => rechazarSolicitud(sol.id, motivo))}>
                  Confirmar rechazo
                </button>
                <button className="filter-clear" disabled={trabajando} onClick={() => setRechazando(false)}>
                  Cancelar
                </button>
              </div>
            )}
          </>
        )}

        {error && <div style={{ fontSize: 13, color: "var(--rev)" }}>{error}</div>}
      </div>
    </div>
  );
}

export default function Solicitudes() {
  const [estado, setEstado]       = useState("pendiente");
  const [recarga, setRecarga]     = useState(0);
  const [anotadores, setAnotadores] = useState([]);
  const [resultado, setResultado] = useState({ clave: null, lista: [], error: "" });

  // Mientras el resultado guardado no corresponda a la clave actual, se
  // está cargando — así el efecto solo actualiza estado al llegar la
  // respuesta (mismo patrón que el Banco de Anotaciones).
  const clave = `${estado}|${recarga}`;
  const cargando = resultado.clave !== clave;

  useEffect(() => {
    getAnotadores().then(r => setAnotadores(r.data)).catch(() => {});
  }, [recarga]);

  useEffect(() => {
    let vigente = true;
    getSolicitudes(estado)
      .then(r => { if (vigente) setResultado({ clave, lista: r.data, error: "" }); })
      .catch(() => {
        if (vigente) setResultado({ clave, lista: [], error: "No se pudieron cargar las solicitudes" });
      });
    return () => { vigente = false; };
  }, [clave, estado]);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-eyebrow"><span className="bar" /><span>Administración</span></div>
          <h1 className="page-title">Solicitudes de <em>registro</em></h1>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 20px 48px" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
          {ESTADOS.map(e => (
            <button key={e.id} className="filter-clear" onClick={() => setEstado(e.id)}
              style={estado === e.id ? { background: "var(--ink)", color: "var(--paper)" } : undefined}>
              {e.label}
            </button>
          ))}
        </div>

        {resultado.error && <div style={{ color: "var(--rev)", fontSize: 13, marginBottom: 12 }}>{resultado.error}</div>}

        {cargando ? (
          <div className="loading"><div className="spinner" />Cargando…</div>
        ) : resultado.lista.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">·</div>
            <div className="empty-state-text">No hay solicitudes {ESTADOS.find(e => e.id === estado).label.toLowerCase()}.</div>
          </div>
        ) : (
          resultado.lista.map(sol => (
            <TarjetaSolicitud key={sol.id} sol={sol} anotadores={anotadores}
              onCambio={() => setRecarga(n => n + 1)} />
          ))
        )}
      </div>
    </div>
  );
}
