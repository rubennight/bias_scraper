import { useState } from "react";

const CLAVE = "bias_scraper.resumenEvento";

// El estado abierto/cerrado se recuerda por navegador. localStorage puede
// fallar (modo privado, datos bloqueados): en ese caso se queda abierto.
function leerAbierto() {
  try { return localStorage.getItem(CLAVE) !== "cerrado"; } catch { return true; }
}
function guardarAbierto(abierto) {
  try { localStorage.setItem(CLAVE, abierto ? "abierto" : "cerrado"); } catch { /* sin almacenamiento */ }
}

// Resumen del evento al que pertenece la oración, para que el anotador no
// pierda el contexto. Plegable y abierto por defecto.
export default function ResumenEvento({ titular, resumen }) {
  const [abierto, setAbierto] = useState(leerAbierto);

  const alternar = () => {
    const nuevo = !abierto;
    setAbierto(nuevo);
    guardarAbierto(nuevo);
  };

  return (
    <div style={{
      background: "#f4efe5", border: "1px solid #d8d1bf", borderRadius: 8,
      padding: "10px 14px", marginBottom: 14,
    }}>
      <button
        onClick={alternar}
        aria-expanded={abierto}
        style={{
          display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center",
          gap: 10, background: "transparent", border: "none", padding: 0,
          cursor: "pointer", fontFamily: "inherit", textAlign: "left",
        }}
      >
        <span>
          <span style={{ display: "block", fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em", color: "#999", marginBottom: 2 }}>
            Resumen del evento
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", lineHeight: 1.4 }}>{titular}</span>
        </span>
        <span aria-hidden="true" style={{ fontSize: 14, color: "#888", flexShrink: 0 }}>{abierto ? "▾" : "▸"}</span>
      </button>

      {abierto && (
        <p style={{ fontSize: 12.5, color: "#555", lineHeight: 1.6, margin: "8px 0 0" }}>
          {resumen || <em style={{ color: "#999" }}>Sin resumen disponible.</em>}
        </p>
      )}
    </div>
  );
}
