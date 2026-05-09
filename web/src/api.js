// api.js — Cliente centralizado para el backend
import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:3001/api",
  timeout: 10000,
});

export const getStats       = ()         => api.get("/stats");
export const getEventos     = (params)   => api.get("/eventos", { params });
export const buscarEventos  = (q)        => api.get("/eventos/buscar", { params: { q } });
export const getEvento      = (id)       => api.get(`/eventos/${id}`);
export const getArticulo    = (id)       => api.get(`/articulos/${id}`);
export const anotarArticulo = (id, val)  => api.put(`/articulos/${id}/anotar`, { anotado: val });

export default api;
