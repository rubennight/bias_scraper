# bias_scraper

Sistema computacional para la **separación** de sesgo ideológico en noticias mexicanas multi-fuente, desarrollado como tesis de Ingeniería en Software — Universidad Autónoma de Zacatecas.

---

## Arquitectura

```
bias_scraper/
│
├── scraper/          Capa de datos — Python
│   ├── pipeline.py   Orquestador KDD principal
│   ├── clustering.py Detección de eventos (TF-IDF + grafo + BFS)
│   ├── scraper.py    RSS parser + Newspaper3k + Playwright
│   ├── db.py         Operaciones PostgreSQL
│   ├── config.py     Fuentes, parámetros KDD, listas de filtrado
│   └── requirements.txt
│
├── api/              Capa de servicio — Node.js + Express
│   ├── index.js      Servidor REST (puerto 3001)
│   ├── db.js         Conexión PostgreSQL
│   ├── routes/
│   │   ├── stats.js      GET /api/stats
│   │   ├── eventos.js    GET /api/eventos, GET /api/eventos/:id
│   │   └── articulos.js  GET /api/articulos/:id, PUT /api/articulos/:id/anotar
│   └── package.json
│
├── web/              Capa de presentación — React + Vite
│   ├── src/
│   │   ├── App.jsx
│   │   ├── api.js          Cliente axios
│   │   ├── index.css       Estilos globales
│   │   └── pages/
│   │       ├── Dashboard.jsx     Estadísticas del corpus
│   │       ├── Eventos.jsx       Lista y búsqueda de eventos
│   │       └── EventoDetalle.jsx Detalle por fuente + marcar para anotar
│   └── package.json
│
├── .env              Variables de entorno compartidas
└── README.md
```

### Principio de separación de responsabilidades

```
scraper/ ──escribe──▶ PostgreSQL ◀──lee── api/ ◀──consulta── web/
```

- **scraper/** nunca habla con la API — escribe directo a la base de datos
- **api/** nunca ejecuta el scraper — solo expone datos via REST
- **web/** nunca toca la base de datos — solo consulta la API

---

## Metodología KDD

El sistema implementa Knowledge Discovery in Databases en 6 fases:

| Fase | Nombre | Estado | Descripción |
|------|--------|--------|-------------|
| 1 | Selección | ✅ | RSS por secciones temáticas + filtro temático |
| 2 | Preprocesamiento | ✅ | Extracción de cuerpo + keywords TF-IDF (Newspaper3k) |
| 3 | Transformación | ✅ | Grafo de co-ocurrencia + BFS → eventos multi-fuente |
| 4 | Anotación | ⏳ | Taxonomía A/B/C + Cohen's Kappa ≥ 0.6 |
| 5 | Minería | ○ | XGBoost + SHAP (~37 features lingüísticas) |
| 6 | Interpretación | ○ | Separación hecho/sesgo + perfil por fuente |

---

## Fuentes monitoreadas

| Medio | Orientación |
|-------|-------------|
| La Jornada | Izquierda |
| El Informador | Izquierda |
| Aristegui Noticias | Crítico |
| El Financiero | Crítico |
| Animal Político | Centro |
| El Universal | Centro |
| 24 Horas | Derecha |
| El Norte | Derecha |

---

## Instalación y uso

### Requisitos
- Python 3.11+
- Node.js 18+
- PostgreSQL 14+

### Variables de entorno
Crea un archivo `.env` en la raíz:
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=bias_scraper
DB_USER=postgres
DB_PASSWORD=postgres
```

### 1. Scraper (Python)
```bash
cd scraper
pip install -r requirements.txt
python pipeline.py
```

El pipeline corre automáticamente con una ventana temporal de 7 días.
Los logs se guardan en `scraper/logs/pipeline_YYYYMMDD_HHMMSS.log`.

### 2. API (Node.js)
```bash
cd api
npm install
npm start
# Servidor en http://localhost:3001
```

### 3. Web (React)
```bash
cd web
npm install
npm run dev
# App en http://localhost:5173
```

---

## Endpoints de la API

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/health` | Estado del servidor |
| GET | `/api/stats` | Estadísticas globales del corpus |
| GET | `/api/eventos` | Lista de eventos (paginada, con filtros) |
| GET | `/api/eventos/buscar?q=keyword` | Búsqueda en tiempo real |
| GET | `/api/eventos/:id` | Detalle completo de un evento |
| GET | `/api/articulos/:id` | Cuerpo completo de un artículo |
| PUT | `/api/articulos/:id/anotar` | Marcar artículo para anotación (Fase 4) |

---

## Schema de la base de datos

```sql
fuentes(id, nombre, url_base, orientacion)
eventos(id, titular_evento, num_fuentes, ventana_inicio, ventana_fin, detectado_en)
articulos(id, evento_id, fuente_id, url, titular, cuerpo, autor, fecha_pub, metodo, anotado)
articulo_keywords(id, articulo_id, keyword)
```

---

## Contribución original

Este sistema es el primero en **separar** — no solo detectar — el sesgo ideológico del contenido factual en noticias mexicanas en español, a nivel de oración, con explicabilidad por SHAP.

Los trabajos relacionados más cercanos (Spinde et al. 2021, D'Alonzo & Tegmark 2022, González Esparza et al. 2023) detectan la presencia de sesgo pero no pueden extraer el núcleo factual compartido entre múltiples fuentes.

---

**Autora:** Blanca Esthela Díaz Hernández  
**Asesora:** Dra. Julieta Guadalupe Rodríguez Ruíz  
**Institución:** Universidad Autónoma de Zacatecas — Ingeniería de Software  
**Año:** 2026
