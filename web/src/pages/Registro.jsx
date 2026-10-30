import { useState } from "react";
import { Link } from "react-router-dom";
import { registrarse } from "../api";
import { validarRegistro } from "../lib/validarRegistro";

const VACIO = { nombre_completo: "", email: "", celular: "", password: "", confirmacion: "" };

function Campo({ etiqueta, children }) {
  return (
    <div>
      <label style={{ fontSize: 12, color: "var(--ink-3)", display: "block", marginBottom: 4 }}>{etiqueta}</label>
      {children}
    </div>
  );
}

export default function Registro() {
  const [datos, setDatos]     = useState(VACIO);
  const [errores, setErrores] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const cambiar = (campo) => (e) => setDatos(d => ({ ...d, [campo]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const locales = validarRegistro(datos);
    if (locales.length) { setErrores(locales); return; }

    setErrores([]);
    setEnviando(true);
    try {
      await registrarse({
        nombre_completo: datos.nombre_completo,
        email: datos.email,
        celular: datos.celular,
        password: datos.password,
      });
      setEnviado(true);
    } catch (err) {
      const r = err.response?.data;
      setErrores(r?.errores || [r?.error || "No se pudo enviar la solicitud"]);
    } finally {
      setEnviando(false);
    }
  };

  if (enviado) {
    return (
      <div style={{ maxWidth: 420, margin: "80px auto 0", textAlign: "center" }}>
        <div className="page-eyebrow" style={{ justifyContent: "center", marginBottom: 8 }}>
          <span className="bar" />
          <span>bias<span style={{ color: "var(--rev)" }}>/</span>scraper</span>
        </div>
        <h1 className="page-title" style={{ fontSize: 26, marginBottom: 16 }}>Solicitud <em>enviada</em></h1>
        <p style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.6, marginBottom: 24 }}>
          Un administrador revisará tu solicitud. Cuando sea aprobada podrás iniciar sesión
          con tu email y la contraseña que elegiste.
        </p>
        <Link to="/login" className="filter-clear" style={{ justifyContent: "center" }}>Ir a iniciar sesión</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 420, margin: "64px auto 0" }}>
      <div className="page-eyebrow" style={{ justifyContent: "center", marginBottom: 8 }}>
        <span className="bar" />
        <span>bias<span style={{ color: "var(--rev)" }}>/</span>scraper</span>
      </div>
      <h1 className="page-title" style={{ fontSize: 26, textAlign: "center", marginBottom: 8 }}>
        Crear <em>cuenta</em>
      </h1>
      <p style={{ fontSize: 13, color: "var(--ink-3)", textAlign: "center", marginBottom: 24, lineHeight: 1.5 }}>
        Para anotar oraciones. Tu solicitud debe ser aprobada por un administrador.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }} noValidate>
        <Campo etiqueta="Nombre completo">
          <input className="filter-input" style={{ width: "100%" }} value={datos.nombre_completo}
            onChange={cambiar("nombre_completo")} autoComplete="name" autoFocus required />
        </Campo>
        <Campo etiqueta="Email">
          <input className="filter-input" style={{ width: "100%" }} type="email" value={datos.email}
            onChange={cambiar("email")} autoComplete="email" required />
        </Campo>
        <Campo etiqueta="Celular (10 dígitos)">
          <input className="filter-input" style={{ width: "100%" }} type="tel" value={datos.celular}
            onChange={cambiar("celular")} autoComplete="tel" required />
        </Campo>
        <Campo etiqueta="Contraseña (mínimo 8 caracteres)">
          <input className="filter-input" style={{ width: "100%" }} type="password" value={datos.password}
            onChange={cambiar("password")} autoComplete="new-password" required />
        </Campo>
        <Campo etiqueta="Repite la contraseña">
          <input className="filter-input" style={{ width: "100%" }} type="password" value={datos.confirmacion}
            onChange={cambiar("confirmacion")} autoComplete="new-password" required />
        </Campo>

        {errores.length > 0 && (
          <ul style={{ fontSize: 13, color: "var(--rev)", background: "var(--red-light, #fdf0ea)", padding: "8px 12px 8px 28px", borderRadius: "var(--radius-sm)", margin: 0 }}>
            {errores.map(m => <li key={m}>{m}</li>)}
          </ul>
        )}

        <button type="submit" disabled={enviando} className="filter-clear"
          style={{ marginTop: 6, background: "var(--ink)", color: "var(--paper)", justifyContent: "center" }}>
          {enviando ? "Enviando…" : "Enviar solicitud"}
        </button>
      </form>

      <p style={{ fontSize: 12, color: "var(--ink-3)", textAlign: "center", marginTop: 24 }}>
        ¿Ya tienes cuenta? <Link to="/login" style={{ color: "var(--rev)" }}>Inicia sesión</Link>
      </p>
    </div>
  );
}
