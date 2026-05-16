import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Eventos from "./pages/Eventos";
import EventoDetalle from "./pages/EventoDetalle";
import Anotacion from "./pages/Anotacion";
import Scraper from "./pages/Scraper";
import hasPng from "./components/has.png";
import "./index.css";

export default function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <nav className="navbar">
          <div className="nav-brand">
            <span className="nav-brand-mark" aria-hidden></span>
            <span className="nav-title">bias<span className="slash">/</span>scraper</span>
            <span className="nav-sub">UAZ · Ingeniería de Software</span>
          </div>

          <div className="nav-right">
            <div className="nav-links">
              <NavLink to="/" end className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
                Dashboard
              </NavLink>
              <NavLink to="/eventos" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
                Eventos
              </NavLink>
              <NavLink to="/scraper" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
                Scraper
              </NavLink>
              <NavLink to="/anotacion" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
                Anotación
              </NavLink>
            </div>
            <img src={hasPng} alt="" aria-hidden style={{ height: 26, width: "auto", display: "block" }} />
          </div>
        </nav>

        <main className="main-content">
          <Routes>
            <Route path="/"            element={<Dashboard />} />
            <Route path="/eventos"     element={<Eventos />} />
            <Route path="/eventos/:id" element={<EventoDetalle />} />
            <Route path="/scraper"     element={<Scraper />} />
            <Route path="/anotacion"   element={<Anotacion />} />
          </Routes>
        </main>

        <footer className="app-foot">
          <span>bias_scraper · UAZ · 2025</span>
          <span>Ingeniería de Software</span>
          <span>build 0.3.1</span>
        </footer>
      </div>
    </BrowserRouter>
  );
}
