# =============================================================
# clustering.py — KDD Fases 1 y 3: Selección y Transformación
#
# Estrategia: keywords TF-IDF + grafo de co-ocurrencia + BFS
#
# Flujo:
# 1. Descargar RSS de secciones → artículos candidatos
# 2. Filtrado temático → descartar deportes/entretenimiento
# 3. Descargar cuerpo completo → extraer keywords con Newspaper3k
# 4. Construir grafo: nodos=artículos, aristas=keywords compartidas
#    (solo entre artículos de la misma ventana temporal)
# 5. BFS → componentes conectadas = eventos
# 6. Filtrar eventos con >= MIN_FUENTES_POR_EVENTO fuentes distintas
# =============================================================

import logging
import time
from datetime import date, datetime, timedelta
from collections import defaultdict

from scraper import parsear_rss, scrape_con_newspaper, scrape_con_playwright
from config import (
    RSS_FEEDS, HORAS_ANTIGUEDAD, DELAY_SCRAPER,
    MIN_FUENTES_POR_EVENTO, MAX_ARTICULOS_POR_FUENTE,
    PALABRAS_RELEVANTES, PALABRAS_EXCLUIR,
    MIN_KEYWORDS_COMPARTIDAS,
)

log = logging.getLogger(__name__)

# Palabras que Newspaper3k puede extraer pero no identifican
# el evento específico — demasiado genéricas
STOPWORDS_KEYWORDS = {
    "méxico", "mexico", "nacional", "gobierno", "federal",
    "president", "presidenta", "nuevo", "nueva", "hoy",
    "año", "dice", "dijo", "señaló", "informó", "según",
    "durante", "tras", "ante", "sobre", "caso", "vez",
}


# ── KDD FASE 1: Selección ─────────────────────────────────────

def recolectar_articulos(ventana_inicio: date, ventana_fin: date) -> list:
    """
    KDD Fase 1 — Selección de datos.

    Descarga RSS de todas las secciones configuradas y filtra
    artículos cuya fecha_pub esté dentro de la ventana temporal.
    Esto garantiza que el clustering nunca mezcle artículos de
    distintas semanas — cada ejecución tiene su propio contexto.

    Si fecha_pub es None (el RSS no la incluye), el artículo se
    acepta por defecto — se descartará en etapas posteriores si
    su fecha real está fuera de la ventana.
    """
    todos  = []
    vistos = set()

    # Convertir a datetime para comparación con fecha_pub (que es datetime)
    inicio_dt = datetime.combine(ventana_inicio, datetime.min.time())
    fin_dt    = datetime.combine(ventana_fin,    datetime.max.time())

    for fuente_nombre, feeds in RSS_FEEDS.items():
        log.info(f"[Selección] Descargando secciones de {fuente_nombre}...")
        for url_feed in feeds:
            items = parsear_rss(url_feed)
            for item in items:
                if item["url"] in vistos:
                    continue
                # Filtrar por ventana temporal si la fecha está disponible
                if item["fecha_pub"]:
                    fecha = item["fecha_pub"].replace(tzinfo=None)
                    if not (inicio_dt <= fecha <= fin_dt):
                        continue
                vistos.add(item["url"])
                item["fuente_nombre"] = fuente_nombre
                todos.append(item)
        time.sleep(1)

    log.info(f"[Selección] {len(todos)} artículos en ventana {ventana_inicio} → {ventana_fin}")
    return todos


def filtrar_por_tema(articulos: list) -> list:
    """
    KDD Fase 1 — Filtrado temático previo al clustering.
    Criterio doble: sin palabras de exclusión + con palabra relevante.
    """
    filtrados  = []
    descartados = 0

    for art in articulos:
        titular_lower = art["titular"].lower()

        if any(p in titular_lower for p in PALABRAS_EXCLUIR):
            descartados += 1
            continue

        if not any(p in titular_lower for p in PALABRAS_RELEVANTES):
            descartados += 1
            continue

        filtrados.append(art)

    log.info(f"[Filtrado temático] {len(filtrados)} relevantes · {descartados} descartados")
    return filtrados


# ── KDD FASE 3: Transformación ────────────────────────────────

def extraer_keywords_articulo(art: dict) -> list:
    """
    Descarga el cuerpo completo y extrae keywords con TF-IDF
    interno de Newspaper3k (article.nlp()).
    Limpia stopwords genéricas que no identifican el evento.
    """
    datos = scrape_con_newspaper(art["url"], art.get("fecha_pub"))
    if not datos:
        datos = scrape_con_playwright(art["url"], art.get("fecha_pub"))

    if not datos:
        return []

    art["titular"]   = datos["titular"] or art["titular"]
    art["cuerpo"]    = datos["cuerpo"]
    art["autor"]     = datos["autor"]
    art["fecha_pub"] = datos["fecha_pub"] or art.get("fecha_pub")
    art["metodo"]    = datos["metodo"]

    keywords_raw = datos.get("keywords", [])
    keywords_limpias = [
        kw.lower().strip()
        for kw in keywords_raw
        if kw.lower().strip() not in STOPWORDS_KEYWORDS
        and len(kw.strip()) > 3
    ]
    return keywords_limpias


def extraer_keywords_todos(articulos: list) -> list:
    """
    Extrae keywords de todos los artículos filtrados.
    Descarta artículos sin cuerpo o sin keywords útiles.
    """
    log.info(f"[Transformación] Extrayendo keywords de {len(articulos)} artículos...")
    enriquecidos = []

    for i, art in enumerate(articulos):
        keywords = extraer_keywords_articulo(art)
        if keywords:
            art["keywords"] = keywords
            enriquecidos.append(art)
            log.info(
                f"  [{i+1}/{len(articulos)}] {art['fuente_nombre']}: "
                f"{art['titular'][:45]}... → {keywords[:4]}"
            )
        else:
            log.info(f"  [{i+1}/{len(articulos)}] ✗ Sin keywords: {art['url'][:50]}")
        time.sleep(DELAY_SCRAPER)

    log.info(f"[Transformación] {len(enriquecidos)} artículos con keywords")
    return enriquecidos


def construir_grafo_eventos(articulos: list) -> dict:
    """
    Construye grafo de co-ocurrencia de keywords.
    Nodos = artículos · Aristas = ≥ MIN_KEYWORDS_COMPARTIDAS keywords
    comunes entre artículos de FUENTES DISTINTAS.
    """
    grafo = defaultdict(set)

    for i in range(len(articulos)):
        for j in range(i + 1, len(articulos)):
            a = articulos[i]
            b = articulos[j]

            if a["fuente_nombre"] == b["fuente_nombre"]:
                continue

            comunes = set(a["keywords"]) & set(b["keywords"])
            if len(comunes) >= MIN_KEYWORDS_COMPARTIDAS:
                grafo[a["url"]].add(b["url"])
                grafo[b["url"]].add(a["url"])

    log.info(f"[Grafo] {len(grafo)} artículos con al menos una conexión")
    return dict(grafo)


def componentes_conectadas(articulos: list, grafo: dict) -> list:
    """
    BFS para encontrar componentes conectadas del grafo.
    Cada componente = un evento cubierto por múltiples fuentes.
    """
    idx       = {art["url"]: art for art in articulos}
    visitados = set()
    componentes = []

    for url in grafo:
        if url in visitados:
            continue

        componente = []
        cola = [url]

        while cola:
            actual = cola.pop(0)
            if actual in visitados:
                continue
            visitados.add(actual)
            if actual in idx:
                componente.append(idx[actual])
            for vecino in grafo.get(actual, []):
                if vecino not in visitados:
                    cola.append(vecino)

        if len(componente) >= 2:
            componentes.append(componente)

    log.info(f"[Grafo] {len(componentes)} componentes con ≥2 artículos")
    return componentes


def filtrar_eventos_validos(clusters: list) -> list:
    """
    Descarta clusters sin cobertura multi-fuente suficiente.
    Calcula top keywords del cluster como descriptor del evento.
    """
    validos = []

    for cluster in clusters:
        fuentes = set(art["fuente_nombre"] for art in cluster)
        if len(fuentes) < MIN_FUENTES_POR_EVENTO:
            continue

        titular = max(cluster, key=lambda a: len(a.get("titular", "")))["titular"]

        conteo_kw = defaultdict(int)
        for art in cluster:
            for kw in art.get("keywords", []):
                conteo_kw[kw] += 1
        top_keywords = sorted(conteo_kw, key=conteo_kw.get, reverse=True)[:6]

        validos.append({
            "titular_evento": titular,
            "num_fuentes":    len(fuentes),
            "fuentes":        list(fuentes),
            "top_keywords":   top_keywords,
            "articulos":      cluster,
        })

    log.info(f"[Filtrado] {len(validos)} eventos válidos (≥{MIN_FUENTES_POR_EVENTO} fuentes)")
    return validos


# ── Función principal ─────────────────────────────────────────

def detectar_eventos(ventana_inicio: date, ventana_fin: date) -> list:
    """
    Pipeline KDD completo para una ventana temporal de DIAS_VENTANA días.

    Fase 1: recolectar_articulos(ventana) + filtrar_por_tema()
    Fase 3: extraer_keywords_todos() → construir_grafo_eventos()
            → componentes_conectadas() → filtrar_eventos_validos()

    La ventana garantiza que artículos de distintas semanas nunca
    se mezclen en el mismo cluster de evento.
    """
    log.info(f"[Pipeline] Ventana: {ventana_inicio} → {ventana_fin}")

    articulos = recolectar_articulos(ventana_inicio, ventana_fin)
    if not articulos:
        log.info("[Pipeline] Sin artículos en la ventana.")
        return []

    articulos = filtrar_por_tema(articulos)
    if not articulos:
        log.info("[Pipeline] Sin artículos relevantes tras filtrado.")
        return []

    articulos = extraer_keywords_todos(articulos)
    if not articulos:
        log.info("[Pipeline] Sin artículos con keywords.")
        return []

    grafo = construir_grafo_eventos(articulos)
    if not grafo:
        log.info("[Pipeline] Sin conexiones entre artículos.")
        return []

    clusters = componentes_conectadas(articulos, grafo)
    if not clusters:
        log.info("[Pipeline] Sin clusters detectados.")
        return []

    return filtrar_eventos_validos(clusters)
