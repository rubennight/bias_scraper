import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Eventos from "./pages/Eventos";
import EventoDetalle from "./pages/EventoDetalle";
import Anotacion    from "./pages/Anotacion";
import Scraper      from "./pages/Scraper";
import Clasificador from "./pages/Clasificador";
import Login from "./pages/Login";
import hasPng from "./components/has.png";
import { AuthProvider, useAuth } from "./AuthContext";
import { ThemeProvider } from "./ThemeContext";
import ThemeToggle from "./components/ThemeToggle";
import RouteGuard from "./RouteGuard";
import "./index.css";

function NavAuth() {
  const { usuario, logout } = useAuth();

  if (!usuario) {
    return (
      <NavLink to="/login" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
        Iniciar sesión
      </NavLink>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
        {usuario.usuario} <span style={{ opacity: .6 }}>· {usuario.rol}</span>
      </span>
      <button
        onClick={logout}
        className="nav-link"
        style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", padding: 0 }}
      >
        Cerrar sesión
      </button>
    </div>
  );
}

function NavLinks() {
  const { usuario } = useAuth();
  const puedeAnotar = usuario?.rol === "anotador" || usuario?.rol === "admin";
  const esAdmin     = usuario?.rol === "admin";

  return (
    <div className="nav-links">
      <NavLink to="/" end className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
        Dashboard
      </NavLink>
      <NavLink to="/eventos" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
        Eventos
      </NavLink>
      {esAdmin && (
        <NavLink to="/scraper" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          Scraper
        </NavLink>
      )}
      {puedeAnotar && (
        <NavLink to="/anotacion" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          Anotación
        </NavLink>
      )}
      {esAdmin && (
        <NavLink to="/clasificador" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          Clasificador
        </NavLink>
      )}
    </div>
  );
}

function Shell() {
  return (
    <div className="app">
      <nav className="navbar">
        <div className="nav-brand">
          <span className="nav-brand-mark" aria-hidden></span>
          <span className="nav-title">bias<span className="slash">/</span>scraper</span>
          <span className="nav-sub">UAZ · Ingeniería de Software</span>
        </div>

        <div className="nav-right">
          <NavLinks />
          <NavAuth />
          <ThemeToggle />
          <img src={hasPng} alt="" aria-hidden style={{ height: 26, width: "auto", display: "block" }} />
        </div>
      </nav>

      <main className="main-content">
        <Routes>
          {/* Públicas — sin sesión */}
          <Route path="/"            element={<Dashboard />} />
          <Route path="/eventos"     element={<Eventos />} />
          <Route path="/eventos/:id" element={<EventoDetalle />} />
          <Route path="/login"       element={<Login />} />

          {/* Anotador o admin */}
          <Route path="/anotacion" element={
            <RouteGuard roles={["anotador", "admin"]}><Anotacion /></RouteGuard>
          } />

          {/* Solo admin */}
          <Route path="/scraper" element={
            <RouteGuard roles={["admin"]}><Scraper /></RouteGuard>
          } />
          <Route path="/clasificador" element={
            <RouteGuard roles={["admin"]}><Clasificador /></RouteGuard>
          } />
        </Routes>
      </main>

      <footer className="app-foot">
        <span>bias_scraper · UAZ · 2025</span>
        <span>Ingeniería de Software</span>
        <span>build 0.3.1</span>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Shell />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
