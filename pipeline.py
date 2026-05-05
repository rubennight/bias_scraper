# =============================================================
# pipeline.py — Orquestador del flujo KDD completo
#
# Metodología: KDD (Knowledge Discovery in Databases)
# Fase 1 — Selección:    recolectar artículos por secciones RSS
# Fase 3 — Transform.:   clustering por similaridad semántica
# Fases 2,4,5:           anotación, clasificación, interpretación
#                        (implementadas en etapas posteriores)
#
# Uso: python pipeline.py
# =============================================================

import os
import logging
from datetime import datetime
from config import FUENTES
from db import (
    crear_tablas,
    insertar_fuentes,
    insertar_evento,
    insertar_articulo,
    obtener_fuentes,
    obtener_fuente_por_nombre,
    insertar_keywords,           # ← agregar esta línea
)
from clustering import detectar_eventos

# ── Logs ─────────────────────────────────────────────────────
os.makedirs("logs", exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(
            f"logs/pipeline_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log",
            encoding="utf-8"
        ),
        logging.StreamHandler()
    ]
)


def ejecutar():
    inicio = datetime.now()
    print("=" * 60)
    print("BIAS SCRAPER — Pipeline KDD")
    print(f"Fecha y hora: {inicio.strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    # ── Paso 1: Preparar base de datos ───────────────────────
    print("\n[1/3] Preparando base de datos...")
    crear_tablas()
    insertar_fuentes(FUENTES)
    fuentes = obtener_fuentes()
    print(f"      {len(fuentes)} fuentes cargadas.")

    # Construir índice nombre → id para búsqueda rápida
    fuente_idx = {f["nombre"]: f["id"] for f in fuentes}

    # ── Paso 2: KDD Fases 1 y 3 — Detección de eventos ──────
    print("\n[2/3] Detectando eventos por clustering semántico...")
    print("      (Descarga RSS de secciones → keywords TF-IDF → grafo → BFS)")
    eventos = detectar_eventos()

    if not eventos:
        print("[Pipeline] Sin eventos detectados. Terminando.")
        return

    print(f"\n      {len(eventos)} eventos detectados con cobertura multi-fuente.")

    # ── Paso 3: Guardar en PostgreSQL ─────────────────────────
    print("\n[3/3] Guardando en base de datos...")
    total_articulos = 0
    total_guardados = 0
    total_fallidos  = 0

    for evento in eventos:
        print(f"\n{'─' * 60}")
        print(f"[Evento] '{evento['titular_evento'][:55]}...'")
        print(f"         Fuentes: {', '.join(evento['fuentes'])}")

        # Insertar el evento
        evento_id = insertar_evento(
            evento["titular_evento"],
            evento["num_fuentes"]
        )

        # Insertar cada artículo del evento
        for art in evento["articulos"]:
            total_articulos += 1
            fuente_id = fuente_idx.get(art.get("fuente_nombre"))

            if not fuente_id:
                print(f"  [DB] Fuente no encontrada: {art.get('fuente_nombre')}")
                total_fallidos += 1
                continue

            try:
                articulo_id = insertar_articulo(evento_id, fuente_id, art)
                if articulo_id:
                    insertar_keywords(articulo_id, art.get("keywords", []))
                    total_guardados += 1
                    print(f"  ✓ [{art['fuente_nombre']}] {art['titular'][:500]}...")
                else:
                    print(f"  ~ [{art['fuente_nombre']}] Ya existía (URL duplicada)")
            except Exception as e:
                print(f"  ✗ Error al guardar: {e}")
                total_fallidos += 1

    # ── Resumen ───────────────────────────────────────────────
    duracion = datetime.now() - inicio
    print(f"\n{'=' * 60}")
    print("Pipeline KDD finalizado.")
    print(f"  Eventos detectados  : {len(eventos)}")
    print(f"  Artículos extraídos : {total_articulos}")
    print(f"  Guardados en BD     : {total_guardados}")
    print(f"  Fallidos            : {total_fallidos}")
    print(f"  Duración total      : {str(duracion).split('.')[0]}")
    print("=" * 60)


if __name__ == "__main__":
    ejecutar()
