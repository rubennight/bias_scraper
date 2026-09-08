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

import io
import os
import sys
import logging
from datetime import date, datetime
from config import FUENTES
from db import (
    crear_tablas,
    insertar_fuentes,
    insertar_evento,
    eliminar_evento,
    insertar_articulo,
    obtener_fuentes,
    insertar_keywords,
    obtener_evento_id_por_urls,
    actualizar_num_fuentes,
    obtener_articulos_evento,
    actualizar_resumen_evento,
    guardar_candidatos,
    obtener_candidatos,
    eliminar_candidatos,
    limpiar_candidatos_vencidos,
)
from clustering import detectar_eventos, get_semana_iso
from annotator import segmentar_articulos_nuevos
from actors import extraer_actores_nuevos
from summarizer import generar_resumen_evento

# ── Logging ───────────────────────────────────────────────────
# Todo lo que pase por logging.info() — incluyendo clustering.py
# y scraper.py que usan getLogger(__name__) — va al mismo archivo.
os.makedirs("logs", exist_ok=True)

_timestamp  = datetime.now().strftime("%Y%m%d_%H%M%S")
_log_path   = f"logs/pipeline_{_timestamp}.log"
_formatter  = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")

_file_handler   = logging.FileHandler(_log_path, encoding="utf-8")
_file_handler.setFormatter(_formatter)

# Forzar UTF-8 en stdout para evitar errores CP1252 en Windows
_stdout_utf8    = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", write_through=True)
_stream_handler = logging.StreamHandler(_stdout_utf8)
_stream_handler.setFormatter(_formatter)

# Configurar el logger raíz — captura todos los módulos
logging.basicConfig(level=logging.INFO, handlers=[_file_handler, _stream_handler])
log = logging.getLogger(__name__)


def ejecutar():
    inicio = datetime.now()

    # Ventana ISO de la semana ACTUAL — lunes a domingo, basada en HOY.
    #
    # Se usó la semana ANTERIOR (date.today() - 7 días) entre el
    # 2026-09-06 y el 2026-09-08 buscando resultados deterministas sin
    # importar qué día se ejecute el pipeline. Se revirtió: los feeds
    # RSS de los medios retienen muy pocas horas de contenido — Reforma
    # ~15h, El Universal ~8h, la mayoría bajo 2 días — muy por debajo de
    # los hasta 13 días de antigüedad que puede tener "la semana
    # anterior" dependiendo de qué día del ciclo actual se corra. Para
    # cuando el pipeline pedía esa ventana, la mayoría de los feeds ya
    # habían rotado ese contenido por completo: no es que fallara el
    # scraping, el artículo ya no estaba en el RSS. Se confirmó en vivo
    # (2026-09-07): la misma ventana pasó de 365 candidatos a las 08:15
    # a solo 53 a las 22:24, mismo día, por pura rotación de los feeds.
    #
    # El problema que motivó el cambio original (correr a mitad de
    # semana da resultados parciales/no deterministas) ya lo resuelve
    # mejor articulos_candidatos (ver db.py y
    # docs/bitacora/2026-09-07-candidatos-pendientes.md): los artículos
    # sin evento válido se acumulan entre corridas en vez de perderse,
    # así que correr sobre la semana en curso ya no arriesga perder
    # cobertura por depender de que la semana haya cerrado — solo hace
    # falta esperar suficientes corridas dentro de esa misma ventana.
    ventana_inicio, ventana_fin = get_semana_iso(date.today())

    # Semana ISO número para el log (de la ventana analizada, no de hoy)
    iso_year, iso_week, _ = ventana_inicio.isocalendar()

    log.info("=" * 60)
    log.info("BIAS SCRAPER — Pipeline KDD")
    log.info(f"Fecha y hora  : {inicio.strftime('%Y-%m-%d %H:%M:%S')}")
    log.info(f"Semana ISO    : {iso_year}-W{iso_week:02d}")
    log.info(f"Ventana       : {ventana_inicio} (lun) → {ventana_fin} (dom)")
    log.info(f"Log guardado  : {_log_path}")
    log.info("=" * 60)

    # ── Paso 1: Preparar base de datos ───────────────────────
    log.info("\n[1/5] Preparando base de datos...")
    crear_tablas()
    insertar_fuentes(FUENTES)
    fuentes = obtener_fuentes()
    log.info(f"      {len(fuentes)} fuentes cargadas.")

    fuente_idx = {f["nombre"]: f["id"] for f in fuentes}

    # ── Paso 2: KDD Fases 1 y 3 — Detección de eventos ──────
    log.info("\n[2/5] Detectando eventos por clustering semántico...")
    log.info(f"      RSS secciones → filtro temático → keywords TF-IDF → grafo → BFS")

    eliminados = limpiar_candidatos_vencidos(ventana_inicio)
    if eliminados:
        log.info(f"      {eliminados} candidatos de semanas anteriores purgados.")

    candidatos_previos = obtener_candidatos(ventana_inicio, ventana_fin)
    if candidatos_previos:
        log.info(f"      {len(candidatos_previos)} candidatos pendientes de corridas anteriores.")

    eventos, huerfanos = detectar_eventos(ventana_inicio, ventana_fin, candidatos_previos)

    log.info(f"\n      {len(eventos)} eventos detectados con cobertura multi-fuente.")

    # ── Paso 3: Guardar en PostgreSQL ─────────────────────────
    log.info("\n[3/5] Guardando en base de datos...")
    total_articulos = 0
    total_guardados = 0
    total_fallidos  = 0
    urls_promovidas = []

    for evento in eventos:
        log.info(f"\n{'─' * 60}")
        log.info(f"[Evento] '{evento['titular_evento'][:55]}...'")
        log.info(f"         Fuentes   : {', '.join(evento['fuentes'])}")
        log.info(f"         Keywords  : {', '.join(evento.get('top_keywords', []))}")
        log.info(f"         Ventana   : {ventana_inicio} - {ventana_fin}")

        # Verificar si algún artículo del cluster ya existe en la BD
        # para reutilizar el evento existente en lugar de crear un duplicado
        urls_cluster = [art["url"] for art in evento["articulos"]]
        evento_existente_id = obtener_evento_id_por_urls(urls_cluster)

        if evento_existente_id:
            evento_id    = evento_existente_id
            evento_nuevo = False
            actualizar_num_fuentes(evento_id, evento["num_fuentes"])
            log.info(f"  [DB] Evento ya existe (#{evento_id}) — agregando artículos nuevos.")
        else:
            evento_id    = insertar_evento(
                evento["titular_evento"],
                evento["num_fuentes"],
                ventana_inicio,
                ventana_fin,
            )
            evento_nuevo = True
            log.info(f"  [DB] Nuevo evento #{evento_id} creado.")

        guardados_evento = 0

        for art in evento["articulos"]:
            total_articulos += 1
            fuente_id = fuente_idx.get(art.get("fuente_nombre"))

            if not fuente_id:
                log.info(f"  [DB] Fuente no encontrada: {art.get('fuente_nombre')}")
                total_fallidos += 1
                continue

            try:
                articulo_id = insertar_articulo(evento_id, fuente_id, art)
                # Sin excepción == la fila ya está en articulos (recién
                # insertada o ya existía) → se puede retirar de candidatos.
                urls_promovidas.append(art["url"])
                if articulo_id:
                    insertar_keywords(articulo_id, art.get("keywords", []))
                    guardados_evento += 1
                    total_guardados += 1
                    log.info(f"  OK [{art['fuente_nombre']}] {art['titular'][:50]}...")
                else:
                    log.info(f"  ~~ [{art['fuente_nombre']}] Ya existia (URL duplicada)")
            except Exception as e:
                log.error(f"  ERROR al guardar: {e}")
                total_fallidos += 1

        # Solo eliminar el evento si fue recién creado y todos los artículos
        # eran duplicados — no eliminar eventos pre-existentes
        if guardados_evento == 0 and evento_nuevo:
            eliminar_evento(evento_id)
            log.info(f"  [Evento] Todos los articulos eran duplicados. Evento eliminado.")
        elif guardados_evento > 0:
            # Título + resumen vía Claude — sobre el estado COMPLETO del
            # evento en BD (no solo lo agregado en esta corrida), para que
            # un evento que crece en varias corridas siga teniendo un
            # resumen que refleje todos sus artículos. Best-effort: no
            # truena el pipeline si falla (ver summarizer.py).
            log.info(f"  [Resumen] Generando título y resumen con Claude...")
            try:
                articulos_completos = obtener_articulos_evento(evento_id)
                resultado = generar_resumen_evento(articulos_completos)
                if resultado:
                    titulo, resumen = resultado
                    actualizar_resumen_evento(evento_id, titulo, resumen)
                    log.info(f"  [Resumen] OK — \"{titulo[:60]}...\"")
                else:
                    log.info(f"  [Resumen] No se generó (ver advertencia arriba si la hay).")
            except Exception as e:
                log.warning(f"  [Resumen] Falló, el evento se queda sin resumen: {e}")

    if urls_promovidas:
        eliminar_candidatos(urls_promovidas)
        log.info(f"\n[Candidatos] {len(urls_promovidas)} promovidos a evento — retirados de pendientes.")

    if huerfanos:
        guardar_candidatos(huerfanos, ventana_inicio, ventana_fin)
        log.info(f"[Candidatos] {len(huerfanos)} artículos sin evento válido — guardados como pendientes.")

    # ── Paso 4: Segmentación para Fase 4 ─────────────────────
    # Segmentar automáticamente los artículos nuevos en oraciones
    # con spaCy para que estén listos cuando se inicie la anotación.
    # Solo procesa artículos que aún no tienen oraciones en la BD.
    if total_guardados > 0:
        log.info(f"\n[4/5] Segmentando artículos nuevos para Fase 4 (anotación)...")
        try:
            seg = segmentar_articulos_nuevos()
            log.info(f"      {seg['articulos_procesados']} artículos → {seg['oraciones_creadas']} oraciones nuevas")
        except Exception as e:
            log.warning(f"      Segmentación falló: {e} — ejecuta annotator.py --segmentar manualmente")
    else:
        log.info(f"\n[4/5] Sin artículos nuevos — segmentación omitida.")

    # ── Paso 5: Extracción de actores ────────────────────────
    log.info(f"\n[5/5] Extrayendo actores de eventos nuevos...")
    try:
        act = extraer_actores_nuevos()
        log.info(f"      {act['eventos_procesados']} eventos → {act['total_actores']} actores extraídos")
    except Exception as e:
        log.warning(f"      Extracción de actores falló: {e} — ejecuta actors.py manualmente")

    # ── Resumen ───────────────────────────────────────────────
    duracion = datetime.now() - inicio
    log.info(f"\n{'=' * 60}")
    log.info("Pipeline KDD finalizado.")
    log.info(f"  Ventana             : {ventana_inicio} → {ventana_fin}")
    log.info(f"  Eventos detectados  : {len(eventos)}")
    log.info(f"  Artículos extraídos : {total_articulos}")
    log.info(f"  Guardados en BD     : {total_guardados}")
    log.info(f"  Fallidos            : {total_fallidos}")
    log.info(f"  Candidatos pendientes: {len(huerfanos)}")
    log.info(f"  Duración total      : {str(duracion).split('.')[0]}")
    log.info(f"  Log guardado en     : {_log_path}")
    log.info("=" * 60)


if __name__ == "__main__":
    ejecutar()
