# =============================================================
# pipeline.py — Orquestador del flujo KDD completo
#
# Metodología: KDD (Knowledge Discovery in Databases)
# Fase 1 — Selección:    RSS por secciones + filtro temático
# Fase 3 — Transform.:   keywords TF-IDF + grafo + BFS
# Fases 2,4,5,6:         anotación, clasificación, separación
#                        (implementadas en etapas posteriores)
#
# Uso: python pipeline.py
# =============================================================

import os
import sys
import logging
from datetime import date, datetime, timedelta
from config import FUENTES, DIAS_VENTANA
from db import (
    crear_tablas,
    insertar_fuentes,
    insertar_evento,
    insertar_articulo,
    obtener_fuentes,
    insertar_keywords,
)
from clustering import detectar_eventos

# ── Logging ───────────────────────────────────────────────────
# Todo lo que pase por logging.info() — incluyendo clustering.py
# y scraper.py que usan getLogger(__name__) — va al mismo archivo.
os.makedirs("logs", exist_ok=True)

_timestamp  = datetime.now().strftime("%Y%m%d_%H%M%S")
_log_path   = f"logs/pipeline_{_timestamp}.log"
_formatter  = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")

_file_handler   = logging.FileHandler(_log_path, encoding="utf-8")
_file_handler.setFormatter(_formatter)

_stream_handler = logging.StreamHandler(sys.stdout)
_stream_handler.setFormatter(_formatter)

# Configurar el logger raíz — captura todos los módulos
logging.basicConfig(level=logging.INFO, handlers=[_file_handler, _stream_handler])
log = logging.getLogger(__name__)


def ejecutar():
    inicio = datetime.now()

    # Calcular ventana temporal actual
    ventana_fin    = date.today()
    ventana_inicio = ventana_fin - timedelta(days=DIAS_VENTANA)

    log.info("=" * 60)
    log.info("BIAS SCRAPER — Pipeline KDD")
    log.info(f"Fecha y hora  : {inicio.strftime('%Y-%m-%d %H:%M:%S')}")
    log.info(f"Ventana       : {ventana_inicio} → {ventana_fin} ({DIAS_VENTANA} días)")
    log.info(f"Log guardado  : {_log_path}")
    log.info("=" * 60)

    # ── Paso 1: Preparar base de datos ───────────────────────
    log.info("\n[1/3] Preparando base de datos...")
    crear_tablas()
    insertar_fuentes(FUENTES)
    fuentes = obtener_fuentes()
    log.info(f"      {len(fuentes)} fuentes cargadas.")

    fuente_idx = {f["nombre"]: f["id"] for f in fuentes}

    # ── Paso 2: KDD Fases 1 y 3 — Detección de eventos ──────
    log.info("\n[2/3] Detectando eventos por clustering semántico...")
    log.info(f"      RSS secciones → filtro temático → keywords TF-IDF → grafo → BFS")
    eventos = detectar_eventos(ventana_inicio, ventana_fin)

    if not eventos:
        log.info("[Pipeline] Sin eventos detectados. Terminando.")
        return

    log.info(f"\n      {len(eventos)} eventos detectados con cobertura multi-fuente.")

    # ── Paso 3: Guardar en PostgreSQL ─────────────────────────
    log.info("\n[3/3] Guardando en base de datos...")
    total_articulos = 0
    total_guardados = 0
    total_fallidos  = 0

    for evento in eventos:
        log.info(f"\n{'─' * 60}")
        log.info(f"[Evento] '{evento['titular_evento'][:55]}...'")
        log.info(f"         Fuentes   : {', '.join(evento['fuentes'])}")
        log.info(f"         Keywords  : {', '.join(evento.get('top_keywords', []))}")
        log.info(f"         Ventana   : {ventana_inicio} → {ventana_fin}")

        evento_id = insertar_evento(
            evento["titular_evento"],
            evento["num_fuentes"],
            ventana_inicio,
            ventana_fin,
        )

        for art in evento["articulos"]:
            total_articulos += 1
            fuente_id = fuente_idx.get(art.get("fuente_nombre"))

            if not fuente_id:
                log.info(f"  [DB] Fuente no encontrada: {art.get('fuente_nombre')}")
                total_fallidos += 1
                continue

            try:
                articulo_id = insertar_articulo(evento_id, fuente_id, art)
                if articulo_id:
                    insertar_keywords(articulo_id, art.get("keywords", []))
                    total_guardados += 1
                    log.info(f"  ✓ [{art['fuente_nombre']}] {art['titular'][:50]}...")
                else:
                    log.info(f"  ~ [{art['fuente_nombre']}] Ya existía (URL duplicada)")
            except Exception as e:
                log.error(f"  ✗ Error al guardar: {e}")
                total_fallidos += 1

    # ── Resumen ───────────────────────────────────────────────
    duracion = datetime.now() - inicio
    log.info(f"\n{'=' * 60}")
    log.info("Pipeline KDD finalizado.")
    log.info(f"  Ventana             : {ventana_inicio} → {ventana_fin}")
    log.info(f"  Eventos detectados  : {len(eventos)}")
    log.info(f"  Artículos extraídos : {total_articulos}")
    log.info(f"  Guardados en BD     : {total_guardados}")
    log.info(f"  Fallidos            : {total_fallidos}")
    log.info(f"  Duración total      : {str(duracion).split('.')[0]}")
    log.info(f"  Log guardado en     : {_log_path}")
    log.info("=" * 60)


if __name__ == "__main__":
    ejecutar()
