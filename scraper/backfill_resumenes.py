# =============================================================
# backfill_resumenes.py — Genera título + resumen (DeepSeek) para
# eventos que ya existían en BD antes de que summarizer.py se
# integrara al pipeline (resumen IS NULL).
#
# Script manual, de un solo uso — no se dispara automáticamente
# desde ningún lado. Sobreescribe titular_evento igual que hace
# pipeline.py normalmente (ver db.actualizar_resumen_evento).
#
# Uso:
#   python backfill_resumenes.py            # pide confirmación
#   python backfill_resumenes.py --dry-run  # solo lista, no llama a la API ni escribe
#   python backfill_resumenes.py --yes      # sin confirmación (para cron/CI)
#   python backfill_resumenes.py --delay 3  # segundos entre llamadas (default: 1.5)
# =============================================================

import argparse
import io
import logging
import sys
import time

from db import obtener_eventos_sin_resumen, obtener_articulos_evento, actualizar_resumen_evento
from summarizer import generar_resumen_evento

_stdout_utf8 = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", write_through=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(_stdout_utf8)],
)
log = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true",
                         help="Solo muestra qué eventos se procesarían, sin llamar a la API ni escribir en BD.")
    parser.add_argument("--yes", action="store_true",
                         help="Omite la confirmación interactiva.")
    parser.add_argument("--delay", type=float, default=1.5,
                         help="Segundos de espera entre llamadas a la API (default: 1.5).")
    args = parser.parse_args()

    eventos = obtener_eventos_sin_resumen()

    if not eventos:
        log.info("No hay eventos sin resumen. Nada que hacer.")
        return

    log.info(f"{len(eventos)} eventos sin resumen encontrados:")
    for ev in eventos:
        log.info(f"  #{ev['id']:>5}  {ev['titular_evento'][:70]}")

    if args.dry_run:
        log.info("\n[dry-run] No se llamó a la API ni se modificó la BD.")
        return

    if not args.yes:
        respuesta = input(
            f"\nEsto hará hasta {len(eventos)} llamadas a la API de DeepSeek y "
            f"SOBREESCRIBIRÁ titular_evento + resumen de cada uno. "
            f"Escribe 'si' para continuar: "
        )
        if respuesta.strip().lower() != "si":
            log.info("Cancelado por el usuario.")
            return

    exitosos = 0
    sin_resultado = 0
    fallidos = 0

    for i, ev in enumerate(eventos, start=1):
        evento_id = ev["id"]
        log.info(f"\n[{i}/{len(eventos)}] Evento #{evento_id} — '{ev['titular_evento'][:55]}...'")
        try:
            articulos = obtener_articulos_evento(evento_id)
            resultado = generar_resumen_evento(articulos)
            if resultado:
                titulo, resumen = resultado
                actualizar_resumen_evento(evento_id, titulo, resumen)
                log.info(f"  OK — \"{titulo[:60]}...\"")
                exitosos += 1
            else:
                log.info("  Sin resultado (ver advertencia arriba si la hay) — se deja sin resumen.")
                sin_resultado += 1
        except Exception as e:
            # No dejar que un evento problemático detenga el backfill completo.
            log.error(f"  ERROR inesperado, se continúa con el siguiente: {e}")
            fallidos += 1

        if i < len(eventos):
            time.sleep(args.delay)

    log.info(f"\n{'=' * 60}")
    log.info("Backfill de resúmenes finalizado.")
    log.info(f"  Total eventos   : {len(eventos)}")
    log.info(f"  Con resumen OK  : {exitosos}")
    log.info(f"  Sin resultado   : {sin_resultado}")
    log.info(f"  Errores         : {fallidos}")
    log.info("=" * 60)


if __name__ == "__main__":
    main()
