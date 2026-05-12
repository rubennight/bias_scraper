import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:3001",
});

export const getStats = () =>
  api.get("/api/stats");

export const getEventos = (params = {}) =>
  api.get("/api/eventos", { params });

export const buscarEventos = (q) =>
  api.get("/api/eventos/buscar", { params: { q } });

export const getEvento = (id) =>
  api.get(`/api/eventos/${id}`);

export const anotarArticulo = (id, anotado) =>
  api.put(`/api/articulos/${id}/anotar`, { anotado });

export const runScraper = () =>
  fetch("http://localhost:3001/api/scraper/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
