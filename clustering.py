# =============================================================
# clustering.py — KDD Fases 1 y 3: Selección y Transformación
#
# Estrategia: keywords compartidas + grafo de co-ocurrencia
#
# En lugar de embeddings + DBSCAN (que producía un solo cluster
# porque XLM-RoBERTa base no diferencia artículos en español),
# usamos las keywords que Newspaper3k extrae con TF-IDF de cada
# artículo. Dos artículos pertenecen al mismo evento si comparten
# al menos MIN_KEYWORDS_COMPARTIDAS keywords significativas.
#
# Flujo:
# 1. Descargar RSS de secciones → artículos candidatos
# 2. Filtrado temático → descartar deportes/entretenimiento
# 3. Descargar cuerpo completo → extraer keywords con Newspaper3k
# 4. Construir grafo: nodos=artículos, aristas=keywords compartidas
# 5. Componentes conectadas del grafo = eventos
# 6. Filtrar eventos con >= MIN_FUENTES_POR_EVENTO fuentes distintas
# =============================================================

import time
from datetime import datetime, timedelta
from collections import defaultdict

from scraper import parsear_rss, scrape_con_newspaper, scrape_con_playwright
from config import (
    RSS_FEEDS, HORAS_ANTIGUEDAD, DELAY_SCRAPER,
    MIN_FUENTES_POR_EVENTO, MAX_ARTICULOS_POR_FUENTE,
    PALABRAS_RELEVANTES, PALABRAS_EXCLUIR,
    MIN_KEYWORDS_COMPARTIDAS,
)

FECHA_LIMITE = datetime.now() - timedelta(hours=HORAS_ANTIGUEDAD)

# Palabras que Newspaper3k puede extraer pero no aportan
# información para identificar el evento específico
STOPWORDS_KEYWORDS = {
    "méxico", "mexico", "nacional", "gobierno", "federal",
    "president", "presidenta", "nuevo", "nueva", "hoy",
    "año", "dice", "dijo", "señaló", "informó", "según",
    "durante", "tras", "ante", "sobre", "caso", "vez",
}


# ── KDD FASE 1: Selección ─────────────────────────────────────

def recolectar_articulos() -> list:
    """
    KDD Fase 1 — Selección de datos.
    Descarga RSS de todas las secciones configuradas.
    Filtra por antigüedad y deduplica por URL.
    Retorna lista de dicts con metadata básica de cada artículo.
    """
    todos  = []
    vistos = set()

    for fuente_nombre, feeds in RSS_FEEDS.items():
        print(f"[Selección] Descargando secciones de {fuente_nombre}...")
        for url_feed in feeds:
            items = parsear_rss(url_feed)
            for item in items:
                if item["url"] in vistos:
                    continue
                if item["fecha_pub"]:
                    fecha = item["fecha_pub"].replace(tzinfo=None)
                    if fecha < FECHA_LIMITE:
                        continue
                vistos.add(item["url"])
                item["fuente_nombre"] = fuente_nombre
                todos.append(item)
        time.sleep(1)

    print(f"[Selección] {len(todos)} artículos recolectados de {len(RSS_FEEDS)} medios")
    return todos


def filtrar_por_tema(articulos: list) -> list:
    """
    KDD Fase 1 — Filtrado temático previo al clustering.
    Descarta artículos de deportes, entretenimiento y clima
    antes de descargar sus cuerpos completos — ahorra tiempo
    y evita que contaminen los clusters de noticias políticas.

    Criterio doble:
    1. Sin palabras de exclusión en el titular
    2. Con al menos una palabra relevante en el titular
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

    print(f"[Filtrado temático] {len(filtrados)} relevantes · {descartados} descartados")
    return filtrados


# ── KDD FASE 3: Transformación ────────────────────────────────

def extraer_keywords_articulo(art: dict) -> list:
    """
    Descarga el cuerpo completo del artículo y extrae sus keywords
    usando Newspaper3k (TF-IDF interno).

    Las keywords son las palabras más representativas del artículo
    — palabras que aparecen frecuentemente en ese texto pero no
    en el corpus general. Son más específicas que los embeddings
    y más baratas computacionalmente.

    Limpia las keywords removiendo stopwords genéricas que no
    ayudan a identificar el evento (gobierno, mexico, hoy, etc.)

    Retorna lista de keywords limpias en minúsculas.
    """
    datos = scrape_con_newspaper(art["url"], art.get("fecha_pub"))
    if not datos:
        datos = scrape_con_playwright(art["url"], art.get("fecha_pub"))

    if not datos:
        return []

    # Guardar el cuerpo extraído en el dict del artículo
    art["titular"]   = datos["titular"] or art["titular"]
    art["cuerpo"]    = datos["cuerpo"]
    art["autor"]     = datos["autor"]
    art["fecha_pub"] = datos["fecha_pub"] or art.get("fecha_pub")
    art["metodo"]    = datos["metodo"]

    # Limpiar keywords
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
    Descarga y extrae keywords de todos los artículos filtrados.
    Descarta artículos de los que no se pudo obtener cuerpo o keywords.
    Retorna la lista de artículos enriquecidos con sus keywords.
    """
    print(f"[Transformación] Extrayendo keywords de {len(articulos)} artículos...")
    enriquecidos = []

    for i, art in enumerate(articulos):
        keywords = extraer_keywords_articulo(art)
        if keywords:
            art["keywords"] = keywords
            enriquecidos.append(art)
            print(f"  [{i+1}/{len(articulos)}] {art['fuente_nombre']}: "
                  f"{art['titular'][:500]}... → {keywords[:4]}")
        else:
            print(f"  [{i+1}/{len(articulos)}] ✗ Sin keywords: {art['url'][:50]}")

        time.sleep(DELAY_SCRAPER)

    print(f"[Transformación] {len(enriquecidos)} artículos con keywords")
    return enriquecidos


def construir_grafo_eventos(articulos: list) -> dict:
    """
    KDD Fase 3 — Construye un grafo de co-ocurrencia de keywords.

    Nodos   = artículos (identificados por su URL)
    Aristas = par de artículos de fuentes DISTINTAS que comparten
              al menos MIN_KEYWORDS_COMPARTIDAS keywords

    Solo conecta artículos de fuentes distintas — no tiene sentido
    agrupar dos artículos del mismo medio como el mismo evento.

    Retorna dict: {url: [urls_conectadas]}
    """
    grafo = defaultdict(set)

    for i in range(len(articulos)):
        for j in range(i + 1, len(articulos)):
            a = articulos[i]
            b = articulos[j]

            # Solo comparar artículos de fuentes distintas
            if a["fuente_nombre"] == b["fuente_nombre"]:
                continue

            # Calcular intersección de keywords
            kw_a = set(a["keywords"])
            kw_b = set(b["keywords"])
            comunes = kw_a & kw_b

            if len(comunes) >= MIN_KEYWORDS_COMPARTIDAS:
                grafo[a["url"]].add(b["url"])
                grafo[b["url"]].add(a["url"])

    print(f"[Grafo] {len(grafo)} artículos con al menos una conexión")
    return dict(grafo)


def componentes_conectadas(articulos: list, grafo: dict) -> list:
    """
    Encuentra los grupos de artículos conectados en el grafo.
    Cada componente conectada = un evento.

    Usa BFS (Breadth-First Search) — recorre el grafo nivel a nivel
    desde cada nodo no visitado para encontrar todos los artículos
    del mismo componente.

    Artículos sin ninguna conexión (no están en el grafo) se descartan
    — son noticias únicas que solo un medio cubrió con esas keywords.
    """
    # Índice URL → artículo para acceso rápido
    idx = {art["url"]: art for art in articulos}

    visitados  = set()
    componentes = []

    for url in grafo:
        if url in visitados:
            continue

        # BFS desde este nodo
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

    print(f"[Grafo] {len(componentes)} componentes con ≥2 artículos")
    return componentes


def filtrar_eventos_validos(clusters: list) -> list:
    """
    Descarta clusters sin cobertura multi-fuente suficiente.
    Solo eventos cubiertos por >= MIN_FUENTES_POR_EVENTO medios distintos.
    Agrega el titular más largo como representante del evento y
    muestra las keywords compartidas más frecuentes del cluster.
    """
    validos = []

    for cluster in clusters:
        fuentes = set(art["fuente_nombre"] for art in cluster)
        if len(fuentes) < MIN_FUENTES_POR_EVENTO:
            continue

        # Titular más largo como representante
        titular = max(cluster, key=lambda a: len(a.get("titular", "")))["titular"]

        # Keywords más frecuentes en el cluster
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

    print(f"[Filtrado] {len(validos)} eventos válidos (≥{MIN_FUENTES_POR_EVENTO} fuentes)")
    return validos


# ── Función principal ─────────────────────────────────────────

def detectar_eventos() -> list:
    """
    Función principal — pipeline KDD completo:

    Fase 1: recolectar_articulos() + filtrar_por_tema()
    Fase 3: extraer_keywords_todos() → construir_grafo_eventos()
            → componentes_conectadas() → filtrar_eventos_validos()

    Retorna lista de eventos con artículos completos listos
    para guardar en PostgreSQL.
    """
    # KDD Fase 1 — Selección
    articulos = recolectar_articulos()
    if not articulos:
        print("[Pipeline] Sin artículos disponibles.")
        return []

    # KDD Fase 1 — Filtrado temático
    articulos = filtrar_por_tema(articulos)
    if not articulos:
        print("[Pipeline] Sin artículos relevantes tras filtrado.")
        return []

    # KDD Fase 3 — Extraer keywords (descarga cuerpos completos)
    articulos = extraer_keywords_todos(articulos)
    if not articulos:
        print("[Pipeline] Sin artículos con keywords.")
        return []

    # KDD Fase 3 — Construir grafo de co-ocurrencia
    grafo = construir_grafo_eventos(articulos)
    if not grafo:
        print("[Pipeline] Sin conexiones entre artículos.")
        return []

    # KDD Fase 3 — Componentes conectadas = eventos
    clusters = componentes_conectadas(articulos, grafo)
    if not clusters:
        print("[Pipeline] Sin clusters detectados.")
        return []

    # Filtrar por cobertura multi-fuente
    eventos = filtrar_eventos_validos(clusters)

    return eventos
