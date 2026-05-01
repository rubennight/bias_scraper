# =============================================================
# scraper.py — Extracción de artículos desde medios mexicanos
#
# CAMBIO: ya no se busca en Google con operador site:
# Google bloqueaba las requests como bot (CAPTCHA/vacío).
#
# Nueva estrategia: RSS feeds de cada medio.
# 1. Descarga el RSS de cada fuente
# 2. Filtra artículos cuyo título/descripción contenga la keyword
# 3. Newspaper3k extrae el cuerpo completo del artículo
# 4. Playwright como fallback si el sitio usa JavaScript
# =============================================================

import re
import time
import requests
import xml.etree.ElementTree as ET
from lxml import etree as lxml_etree
from datetime import datetime, timedelta
from newspaper import Article, Config
from config import DIAS_ANTIGUEDAD, DELAY_SCRAPER

# ── Configuración de Newspaper3k ─────────────────────────────
NEWSPAPER_CONFIG = Config()
NEWSPAPER_CONFIG.browser_user_agent = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)
NEWSPAPER_CONFIG.request_timeout = 15
NEWSPAPER_CONFIG.language = 'es'

FECHA_LIMITE = datetime.now() - timedelta(days=DIAS_ANTIGUEDAD)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
    "Accept-Language": "es-MX,es;q=0.9",
    "Referer": "https://www.google.com/",
}

# Medios cuyos RSS mezclan HTML con XML — lista vacía por ahora
FEEDS_HTML_TOLERANTE = []

# ── RSS feeds por medio ───────────────────────────────────────
# La clave debe coincidir exactamente con el campo "nombre"
# en la tabla fuentes de PostgreSQL.
# Cada medio puede tener varios feeds (por sección).
RSS_FEEDS = {
    # Izquierda
    "La Jornada": [
        "https://www.jornada.com.mx/rss/politica.xml",
        "https://www.jornada.com.mx/rss/economia.xml",
        "https://www.jornada.com.mx/rss/mundo.xml",
    ],
    "El Informador": [
        "https://informador.mx/rss/mexico.xml",
    ],
    # Crítico / independiente
    "Aristegui Noticias": [
        "https://editorial.aristeguinoticias.com/feed/",
        "https://editorial.aristeguinoticias.com/category/mexico/feed/",
    ],
    "El Financiero": [
        "https://www.elfinanciero.com.mx/arc/outboundfeeds/rss/?outputType=xml",
    ],
    # Centro
    "Animal Político": [
        "https://politica.expansion.mx/rss",
    ],
    "El Universal": [
        "https://www.eluniversal.com.mx/arc/outboundfeeds/rss/?outputType=xml",
    ],
    # Derecha
    "24 Horas": [
        "https://www.24-horas.mx/feed",
    ],
    "El Norte": [
        "https://www.elnorte.com/rss/portada.xml",
    ],
}


# ── Utilidades ────────────────────────────────────────────────

def limpiar_texto(texto: str) -> str:
    """Elimina líneas cortas (publicidad, pie de página) y espacios dobles."""
    if not texto:
        return ""
    lineas = texto.split("\n")
    lineas_limpias = [l.strip() for l in lineas if len(l.strip()) > 40]
    return "\n".join(lineas_limpias)


def es_reciente(fecha) -> bool:
    """Retorna True si el artículo está dentro del rango de DIAS_ANTIGUEDAD."""
    if fecha is None:
        return True
    fecha_sin_tz = fecha.replace(tzinfo=None)
    return fecha_sin_tz >= FECHA_LIMITE


def keyword_en_texto(keyword: str, texto: str) -> bool:
    """
    Verifica si la keyword del trend aparece en el texto.
    Primero intenta coincidencia exacta de la frase completa.
    Si no, acepta coincidencia parcial: al menos la mitad de
    las palabras significativas (>3 letras) deben estar presentes.

    Ejemplo:
        keyword = "claudia sheinbaum pardo"
        texto   = "Sheinbaum anuncia nuevo plan de seguridad"
        → True  (coincidencia parcial: "sheinbaum" y "plan" presentes)
    """
    keyword_lower = keyword.lower()
    texto_lower   = texto.lower()

    if keyword_lower in texto_lower:
        return True

    palabras = [p for p in keyword_lower.split() if len(p) > 3]
    if not palabras:
        return False

    coincidencias = sum(1 for p in palabras if p in texto_lower)
    return coincidencias >= max(1, len(palabras) // 2)

# ── Parseo de RSS ─────────────────────────────────────────────

def parsear_rss(url_feed: str) -> list:
    """
    Descarga y parsea un RSS feed.
    - Parser estricto (xml.etree) para la mayoría de feeds
    - Parser tolerante (lxml html) para Proceso y El Heraldo
      que mezclan atributos HTML sin valor dentro del XML
    """
    try:
        resp = requests.get(url_feed, headers=HEADERS, timeout=15)
        time.sleep(1)

        if resp.status_code != 200:
            print(f"    [RSS] HTTP {resp.status_code}: {url_feed}")
            return []

        # Decidir parser según el dominio del feed
        usar_html_parser = any(d in url_feed for d in FEEDS_HTML_TOLERANTE)

        root = None
        if usar_html_parser:
            # lxml html parser: tolera atributos sin valor (async, crossorigin)
            from lxml import html as lxml_html
            doc = lxml_html.fromstring(resp.content)
            # Convertir a string limpio y re-parsear como XML
            items_raw = doc.cssselect("item")
            if not items_raw:
                # Si no hay items en HTML, intentar como XML tolerante
                try:
                    root = lxml_etree.fromstring(
                        resp.content,
                        parser=lxml_etree.XMLParser(recover=True)
                    )
                except Exception:
                    pass
        else:
            # Parser estricto primero
            try:
                root = ET.fromstring(resp.content)
            except ET.ParseError:
                # Fallback: lxml con recover=True
                try:
                    root = lxml_etree.fromstring(
                        resp.content,
                        parser=lxml_etree.XMLParser(recover=True)
                    )
                except Exception as e:
                    print(f"    [RSS] XML inválido en {url_feed}: {e}")
                    return []

        if root is None:
            return []

        # Detectar formato RSS 2.0 o Atom
        items = root.findall(".//item")
        if not items:
            items = root.findall(".//{http://www.w3.org/2005/Atom}entry")

        articulos = []
        for item in items:
            url       = (item.findtext("link") or "").strip()
            titular   = (item.findtext("title") or "").strip()
            desc      = (item.findtext("description") or "").strip()
            fecha_str = (item.findtext("pubDate") or "").strip()

            # Fallback Atom
            if not url:
                link_el = item.find("{http://www.w3.org/2005/Atom}link")
                if link_el is not None:
                    url = link_el.get("href", "").strip()
            if not titular:
                titular = (item.findtext(
                    "{http://www.w3.org/2005/Atom}title") or "").strip()
            if not fecha_str:
                fecha_str = (item.findtext(
                    "{http://www.w3.org/2005/Atom}updated") or "").strip()

            if not url:
                continue

            fecha = None
            for fmt in [
                "%a, %d %b %Y %H:%M:%S %z",
                "%a, %d %b %Y %H:%M:%S GMT",
                "%Y-%m-%dT%H:%M:%SZ",
                "%Y-%m-%dT%H:%M:%S%z",
            ]:
                try:
                    fecha = datetime.strptime(fecha_str.strip(), fmt)
                    break
                except ValueError:
                    continue

            articulos.append({
                "url":         url,
                "titular":     titular,
                "descripcion": re.sub(r"<[^>]+>", "", desc),
                "fecha_pub":   fecha,
            })

        return articulos

    except Exception as e:
        print(f"    [RSS] Error parseando {url_feed}: {e}")
        return []


# ── Scraping con Newspaper3k ──────────────────────────────────

def scrape_con_newspaper(url: str, fecha_rss=None) -> dict | None:
    """
    Extrae el cuerpo completo del artículo con Newspaper3k.
    fecha_rss se usa como fallback si Newspaper3k no detecta la fecha.
    Retorna dict con datos del artículo o None si falla.
    """
    try:
        article = Article(url, config=NEWSPAPER_CONFIG)
        article.download()
        article.parse()

        if not article.text or len(article.text) < 200:
            return None

        fecha = article.publish_date or fecha_rss
        if not es_reciente(fecha):
            return None

        return {
            "url":       url,
            "titular":   article.title or "",
            "cuerpo":    limpiar_texto(article.text),
            "autor":     ", ".join(article.authors) if article.authors else "",
            "fecha_pub": fecha,
            "metodo":    "newspaper3k",
        }
    except Exception as e:
        print(f"    [Newspaper3k] Error en {url}: {e}")
        return None


def scrape_con_playwright(url: str, fecha_rss=None) -> dict | None:
    """
    Fallback para sitios con JavaScript dinámico.
    Abre Chromium headless, espera que cargue, y parsea con Newspaper3k.
    """
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page    = browser.new_page()
            page.goto(url, timeout=20000)
            page.wait_for_load_state("networkidle")
            html = page.content()
            browser.close()

        article = Article(url, config=NEWSPAPER_CONFIG)
        article.set_html(html)
        article.parse()

        if not article.text or len(article.text) < 200:
            return None

        fecha = article.publish_date or fecha_rss
        if not es_reciente(fecha):
            return None

        return {
            "url":       url,
            "titular":   article.title or "",
            "cuerpo":    limpiar_texto(article.text),
            "autor":     ", ".join(article.authors) if article.authors else "",
            "fecha_pub": fecha,
            "metodo":    "playwright",
        }
    except Exception as e:
        print(f"    [Playwright] Error en {url}: {e}")
        return None


# ── Función principal ─────────────────────────────────────────

def buscar_articulos_fuente(keyword: str, fuente: dict) -> list:
    """
    Función principal del scraper.
    1. Obtiene los RSS feeds configurados para el medio
    2. Parsea cada feed y filtra por keyword
    3. Para cada candidato extrae el cuerpo completo
    4. Retorna lista de artículos listos para guardar en BD
    """
    nombre = fuente["nombre"]
    feeds  = RSS_FEEDS.get(nombre, [])

    if not feeds:
        print(f"  [RSS] Sin feeds configurados para {nombre}")
        return []

    # ── Paso 1: recolectar candidatos de todos los feeds ──
    candidatos = []
    for url_feed in feeds:
        items = parsear_rss(url_feed)
        for item in items:
            texto_a_revisar = f"{item['titular']} {item['descripcion']}"
            if keyword_en_texto(keyword, texto_a_revisar):
                candidatos.append(item)

    if not candidatos:
        print(f"  [Scraper] Sin coincidencias para '{keyword}' en {nombre}")
        return []

    print(f"  [Scraper] {len(candidatos)} candidatos en {nombre}")

    # ── Paso 2: extraer cuerpo completo de cada candidato ──
    articulos = []
    for candidato in candidatos[:5]:   # máximo 5 por fuente por keyword
        url = candidato["url"]
        print(f"  [Scraper] → {url}")

        datos = scrape_con_newspaper(url, candidato["fecha_pub"])

        if not datos:
            print(f"  [Scraper] Intentando Playwright...")
            datos = scrape_con_playwright(url, candidato["fecha_pub"])

        if datos:
            print(f"  [Scraper] ✓ '{datos['titular'][:60]}...'")
            articulos.append(datos)
        else:
            print(f"  [Scraper] ✗ No se pudo extraer")

        time.sleep(DELAY_SCRAPER)

    return articulos
