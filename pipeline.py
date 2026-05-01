# =============================================================
# pipeline.py — Orquestador del flujo completo
# Es el único archivo que se ejecuta directamente.
# Une todos los módulos en el orden correcto.
# Uso: python pipeline.py
# =============================================================

import os
import logging
from datetime import datetime
from config import FUENTES
from db import (
    crear_tablas,
    insertar_fuentes,
    insertar_trend,
    insertar_articulo,
    obtener_fuentes,
)
from trends import obtener_trends_mexico
from scraper import buscar_articulos_fuente

# ── Configuración de logs ────────────────────────────────────────────────────
# Crea la carpeta logs/ si no existe
os.makedirs("logs", exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        # Guarda log en archivo con timestamp en el nombre
        logging.FileHandler(
            f"logs/pipeline_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log",
            encoding="utf-8"
        ),
        # También imprime en consola en tiempo real
        logging.StreamHandler()
    ]
)


# ── Pipeline principal ───────────────────────────────────────────────────────

def ejecutar():
    inicio = datetime.now()
    print("=" * 60)
    print("BIAS SCRAPER — Inicio del pipeline")
    print(f"Fecha y hora: {inicio.strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    # ── Paso 1: Preparar base de datos ──────────────────────────
    print("\n[1/4] Preparando base de datos...")
    crear_tablas()
    insertar_fuentes(FUENTES)
    fuentes = obtener_fuentes()
    print(f"      {len(fuentes)} fuentes cargadas.")

    # ── Paso 2: Obtener trends de México ────────────────────────
    print("\n[2/4] Obteniendo trends de Google México...")
    trends = obtener_trends_mexico()

    if not trends:
        print("[Pipeline] No se obtuvieron trends relevantes. Terminando.")
        return

    print(f"      {len(trends)} trends relevantes encontrados.")

    # ── Paso 3: Scrapear artículos por trend y fuente ───────────
    print("\n[3/4] Scrapeando artículos...\n")
    total_articulos  = 0
    total_guardados  = 0
    total_fallidos   = 0

    for trend in trends:
        keyword = trend["keyword"]
        print(f"\n{'─' * 60}")
        print(f"[Trend] '{keyword}' (posición #{trend['volumen']})")

        trend_id = insertar_trend(keyword, trend["volumen"], trend.get("categoria"))

        for fuente in fuentes:
            print(f"\n  [Fuente] {fuente['nombre']} ({fuente['orientacion']})")

            articulos = buscar_articulos_fuente(keyword, fuente)
            total_articulos += len(articulos)

            for art in articulos:
                try:
                    insertar_articulo(trend_id, fuente["id"], art)
                    total_guardados += 1
                except Exception as e:
                    print(f"  [DB] Error al guardar artículo: {e}")
                    total_fallidos += 1

    # ── Paso 4: Resumen final ────────────────────────────────────
    duracion = datetime.now() - inicio
    print(f"\n{'=' * 60}")
    print("[4/4] Pipeline finalizado.")
    print(f"      Trends procesados : {len(trends)}")
    print(f"      Artículos extraídos: {total_articulos}")
    print(f"      Guardados en BD   : {total_guardados}")
    print(f"      Fallidos          : {total_fallidos}")
    print(f"      Duración total    : {str(duracion).split('.')[0]}")
    print("=" * 60)


# ── Punto de entrada ─────────────────────────────────────────────────────────
if __name__ == "__main__":
    ejecutar()
