# =============================================================
# server.py — Servicio HTTP ligero para disparar el pipeline KDD
#
# Reemplaza el `spawn("python", ...)` que hacía api/routes/scraper.js
# directamente — en Docker, api/ y scraper/ son contenedores separados
# y api/ no tiene Python instalado. Este servidor vive dentro del
# contenedor scraper (que sí tiene Python + dependencias pesadas) y
# expone HTTP para que api/ dispare el pipeline vía red interna de
# Docker Compose (http://scraper:8000/run).
#
# En reposo este proceso NO importa pipeline.py ni ninguno de sus
# módulos (clustering, annotator, actors) — solo lo hace el subproceso
# que /run lanza bajo demanda. Así que las cargas pesadas (spaCy,
# pysentimiento/torch/transformers) nunca ocurren mientras el servicio
# está esperando; solo cuando alguien realmente dispara una corrida.
# =============================================================

import os
import re
import json
import time
import subprocess
import threading
import queue

from flask import Flask, request, Response, jsonify

app = Flask(__name__)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PIPELINE_PATH = os.path.join(SCRIPT_DIR, "pipeline.py")


def _api_key_valida():
    esperado = os.environ.get("SCRAPER_API_KEY")
    recibido = request.headers.get("X-API-Key")

    if not esperado:
        return False, ("El servidor no tiene configurada la autenticación del scraper", 500)
    if recibido != esperado:
        return False, ("API key inválida o ausente — envía el header X-API-Key", 401)
    return True, None


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/run", methods=["POST"])
def run():
    ok, error = _api_key_valida()
    if not ok:
        mensaje, codigo = error
        return jsonify({"error": mensaje}), codigo

    def generar_eventos():
        summary = {
            "eventos_detectados": 0,
            "articulos_guardados": 0,
            "articulos_fallidos": 0,
            "duracion": "00:00:00",
        }

        try:
            proceso = subprocess.Popen(
                ["python", "-u", PIPELINE_PATH],
                cwd=SCRIPT_DIR,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
            )
        except Exception as e:
            yield _sse({
                "type": "log", "level": "ERROR",
                "timestamp": _hora(),
                "message": f"Error al ejecutar pipeline: {e}",
            })
            yield _sse({"type": "done", "code": 1})
            return

        lineas = queue.Queue()

        def leer(stream, nivel_fijo):
            for linea in iter(stream.readline, ""):
                lineas.put((linea, nivel_fijo))
            stream.close()

        hilo_out = threading.Thread(target=leer, args=(proceso.stdout, None), daemon=True)
        hilo_err = threading.Thread(target=leer, args=(proceso.stderr, "ERROR"), daemon=True)
        hilo_out.start()
        hilo_err.start()

        ultimo_keepalive = time.time()

        while hilo_out.is_alive() or hilo_err.is_alive() or not lineas.empty():
            try:
                texto, nivel_fijo = lineas.get(timeout=1)
            except queue.Empty:
                if time.time() - ultimo_keepalive >= 5:
                    yield ": keepalive\n\n"
                    ultimo_keepalive = time.time()
                continue

            texto = texto.rstrip("\n")
            if not texto.strip():
                continue

            _actualizar_resumen(summary, texto)

            nivel = nivel_fijo or "INFO"
            if "[ERROR]" in texto:
                nivel = "ERROR"
            if "[DEBUG]" in texto:
                nivel = "DEBUG"

            yield _sse({
                "type": "log",
                "level": nivel,
                "timestamp": _hora(),
                "message": texto,
            })

        codigo = proceso.wait()

        yield _sse({"type": "summary", "data": summary})
        yield _sse({"type": "done", "code": codigo})

    return Response(
        generar_eventos(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            # Evita que un proxy intermedio (nginx, etc.) buffer-ee el stream.
            "X-Accel-Buffering": "no",
        },
    )


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _hora() -> str:
    return time.strftime("%H:%M:%S")


def _actualizar_resumen(summary: dict, texto: str):
    m = re.search(r"Eventos detectados\s*:\s*(\d+)", texto, re.I)
    if m:
        summary["eventos_detectados"] = int(m.group(1))

    m = re.search(r"Guardados en BD\s*:\s*(\d+)", texto, re.I)
    if m:
        summary["articulos_guardados"] = int(m.group(1))

    m = re.search(r"Fallidos\s*:\s*(\d+)", texto, re.I)
    if m:
        summary["articulos_fallidos"] = int(m.group(1))

    if "total" in texto.lower() and "raci" in texto.lower():
        m = re.search(r"Duraci.n total\s*:\s*(.+?)\s*$", texto, re.I)
        if m:
            summary["duracion"] = m.group(1).strip()


if __name__ == "__main__":
    # Solo para desarrollo local sin Docker — en el contenedor lo sirve
    # gunicorn (ver Dockerfile).
    app.run(host="0.0.0.0", port=8000)
