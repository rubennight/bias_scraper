import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const destino = location.state?.from || "/";

  const [usuario, setUsuario]   = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(usuario.trim(), password);
      navigate(destino, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 380, margin: "80px auto 0" }}>
      <div className="page-eyebrow" style={{ justifyContent: "center", marginBottom: 8 }}>
        <span className="bar" />
        <span>bias<span style={{ color: "var(--rev)" }}>/</span>scraper</span>
      </div>
      <h1 className="page-title" style={{ fontSize: 26, textAlign: "center", marginBottom: 28 }}>
        Iniciar <em>sesión</em>
      </h1>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={{ fontSize: 12, color: "var(--ink-3)", display: "block", marginBottom: 4 }}>Usuario</label>
          <input
            className="filter-input"
            style={{ width: "100%" }}
            value={usuario}
            onChange={e => setUsuario(e.target.value)}
            autoFocus
            autoComplete="username"
            required
          />
        </div>
        <div>
          <label style={{ fontSize: 12, color: "var(--ink-3)", display: "block", marginBottom: 4 }}>Contraseña</label>
          <input
            className="filter-input"
            style={{ width: "100%" }}
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        {error && (
          <div style={{ fontSize: 13, color: "var(--rev)", background: "var(--red-light, #fdf0ea)", padding: "8px 12px", borderRadius: "var(--radius-sm)" }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="filter-clear"
          style={{ marginTop: 6, background: "var(--ink)", color: "var(--paper)", justifyContent: "center" }}
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>

      <p style={{ fontSize: 12, color: "var(--ink-3)", textAlign: "center", marginTop: 24 }}>
        Dashboard y Eventos son públicos — no necesitas cuenta para consultarlos.
      </p>
    </div>
  );
}
