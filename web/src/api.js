import axios from "axios";

// VITE_API_URL se define en web/.env(.example) — con fallback a
// localhost:3001 para que el desarrollo local siga funcionando sin
// configurar nada.
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

// withCredentials: true — la sesión vive en una cookie httpOnly, no en
// localStorage (ver AuthContext.jsx). Sin esto el navegador nunca
// manda ni recibe la cookie en las peticiones cross-origin hacia la
// API (frontend y api viven en subdominios distintos en producción).
const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

// Scraper — usa fetch nativo porque la respuesta es un stream SSE.
// credentials: "include" es el equivalente de withCredentials para
// fetch nativo — sin esto la cookie de sesión no viaja y la ruta
// (protegida, solo admin) respondería 401.
export const runScraper = () =>
  fetch(`${API_URL}/api/scraper/run`, { method: "POST", credentials: "include" });

// Autenticación
export const login  = (usuario, password) => api.post("/api/auth/login", { usuario, password });
export const logout = ()                  => api.post("/api/auth/logout");
export const getMe  = ()                  => api.get("/api/auth/me");

// Corpus
export const getStats       = ()       => api.get("/api/stats");
export const getEventos     = (params) => api.get("/api/eventos", { params });
export const buscarEventos  = (q)      => api.get("/api/eventos/buscar", { params: { q } });
export const getEvento      = (id)     => api.get(`/api/eventos/${id}`);
export const anotarArticulo = (id, v)  => api.put(`/api/articulos/${id}/anotar`, { anotado: v });

// Fase 4 — Anotación
export const getAnotadores          = ()       => api.get("/api/anotacion/anotadores");
export const crearAnotador          = (datos)  => api.post("/api/anotacion/anotadores", datos);
export const getOracionesPendientes = (params) => api.get("/api/anotacion/oraciones", { params });
export const guardarAnotacion       = (datos)  => api.post("/api/anotacion/anotar", datos);
export const getStatsAnotador       = (id)     => api.get(`/api/anotacion/stats/${id}`);
export const calcularKappa          = (params) => api.get("/api/anotacion/kappa", { params });
export const getLexicon             = (tipo)   => api.get("/api/anotacion/lexicon", { params: tipo ? { tipo } : {} });
export const marcarCompleja         = (id)     => api.put(`/api/anotacion/oraciones/${id}/compleja`, { compleja: true });
export const marcarDescartada       = (id)     => api.put(`/api/anotacion/oraciones/${id}/descartada`, { descartada: true });

// Banco de Anotaciones — revisión, edición y borrado
export const getBancoAnotaciones    = (params) => api.get("/api/anotacion/banco", { params });
export const eliminarAnotacion      = (id, anotador_id) => api.delete(`/api/anotacion/${id}`, { params: { anotador_id } });

// Actores
export const getActoresEvento = (id, params) => api.get(`/api/actores/evento/${id}`, { params });

// Fase 5 — Entrenamiento
export const getDatasetStats    = ()    => api.get("/api/entrenamiento/dataset");
export const getEntrenamientos  = ()    => api.get("/api/entrenamiento/lista");
export const getEstadoJob       = (id)  => api.get(`/api/entrenamiento/estado/${id}`);
export const iniciarEntrenamiento = ()  => api.post("/api/entrenamiento/iniciar");

export default api;
