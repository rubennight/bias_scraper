import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Eventos from "./pages/Eventos";
import EventoDetalle from "./pages/EventoDetalle";
import "./index.css";

export default function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <nav className="navbar">
          <div className="nav-brand">
            <span className="nav-logo">◈</span>
            <span className="nav-title">bias_scraper</span>
            <span className="nav-sub">UAZ · Ingeniería de Software</span>
          </div>
          <div className="nav-links">
            <NavLink to="/" end className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
              Dashboard
            </NavLink>
            <NavLink to="/eventos" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
              Eventos
            </NavLink>
          </div>
        </nav>

        <main className="main-content">
          <Routes>
            <Route path="/"           element={<Dashboard />} />
            <Route path="/eventos"    element={<Eventos />} />
            <Route path="/eventos/:id" element={<EventoDetalle />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
