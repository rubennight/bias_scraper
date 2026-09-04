import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:3001",
});

// Scraper — usa fetch nativo porque la respuesta es un stream SSE
export const runScraper = () =>
  fetch("http://localhost:3001/api/scraper/run", { method: "POST" });

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
