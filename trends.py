# =============================================================
# trends.py — Obtiene trends de Google Trends México
#
# Usa Playwright para abrir la página HTML de Google Trends
# directamente ya que pytrends fue eliminado (endpoints deprecados).
#
# Filtrado: lista blanca por categorías definidas en config.py.
# Solo pasan trends que coincidan con al menos una keyword
# de alguna categoría (política, seguridad, economía, etc.).
# =============================================================

import time
import urllib.parse
from playwright.sync_api import sync_playwright
from config import MAX_TRENDS, MAX_CANDIDATOS, CATEGORIAS_RELEVANTES

# URL pública de Google Trends México
TRENDS_URL = "https://trends.google.com/trends/trendingsearches/daily?geo=MX&hl=es"


def clasificar_trend(keyword: str) -> str | None:
    """
    Verifica si el keyword pertenece a alguna categoría de interés.

    Recorre cada categoría de CATEGORIAS_RELEVANTES y comprueba si
    alguna de sus keywords aparece dentro del trend (comparación
    en minúsculas para evitar problemas de capitalización).

    Retorna el nombre de la primera categoría que coincida,
    o None si el trend no es relevante para ninguna categoría.

    Ejemplo:
        "reforma al poder judicial" → "politica"
        "tipo de cambio peso dolar" → "economia"
        "toluca vs los angeles"     → None  (descartado)
    """
    keyword_lower = keyword.lower()
    for categoria, keywords_categoria in CATEGORIAS_RELEVANTES.items():
        for kw in keywords_categoria:
            if kw in keyword_lower:
                return categoria
    return None


def obtener_trends_mexico() -> list:
    """
    Abre Google Trends México con Playwright, espera a que el JS
    renderice el contenido y extrae los keywords del día.

    Retorna lista de dicts:
    [{"keyword": str, "volumen": int, "categoria": str}, ...]

    - volumen   → posición en el ranking de Google Trends (1 = más trending)
    - categoria → categoría asignada según CATEGORIAS_RELEVANTES

    Lógica de extracción:
    Google Trends renderiza cada trend como un link con href del tipo:
      /trends/explore?q=carmen+aristegui&date=now+1-d&geo=MX&hl=es
    El keyword está codificado en el parámetro q= de esa URL.
    urllib.parse.parse_qs() decodifica ese parámetro.
    """
    print("[Trends] Abriendo Google Trends México con Playwright...")

    trends = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            page.goto(TRENDS_URL, timeout=30000)
            page.wait_for_load_state("networkidle")
            time.sleep(5)  # pausa extra — el contenido carga de forma asíncrona

            # Extraer todos los links que apuntan a /trends/explore?q=
            links = page.query_selector_all('a[href*="explore?q="]')

            posicion = 1
            vistos = set()
            candidatos_revisados = 0

            for link in links:
                # Detenerse si ya tenemos suficientes trends relevantes
                if len(trends) >= MAX_TRENDS:
                    break
                # Detenerse si ya revisamos suficientes candidatos
                if candidatos_revisados >= MAX_CANDIDATOS:
                    break

                href = link.get_attribute("href") or ""

                # Parsear el parámetro q= del href
                parsed  = urllib.parse.urlparse(href)
                params  = urllib.parse.parse_qs(parsed.query)
                q_values = params.get("q", [])

                if not q_values:
                    continue

                keyword = q_values[0].strip()

                # Ignorar duplicados
                if keyword in vistos:
                    continue
                vistos.add(keyword)
                candidatos_revisados += 1

                # Clasificar con lista blanca
                categoria = clasificar_trend(keyword)

                if categoria is None:
                    print(f"[Trends] Descartado (no relevante): {keyword}")
                    continue

                trends.append({
                    "keyword":   keyword,
                    "volumen":   posicion,
                    "categoria": categoria,
                })
                print(f"[Trends] ✓ #{posicion} [{categoria}]: {keyword}")
                posicion += 1

        except Exception as e:
            print(f"[Trends] Error al extraer trends: {e}")

        finally:
            browser.close()

    print(f"[Trends] Total trends relevantes: {len(trends)}")
    return trends
