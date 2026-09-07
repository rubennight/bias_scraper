# =============================================================
# summarizer.py — Título y resumen del evento vía DeepSeek API
#
# Se ejecuta después de guardar los artículos de un evento en
# pipeline.py. Recibe el contenido completo ya guardado en BD (todos
# los artículos del evento, no solo los de esta corrida) y le pide al
# modelo un título limpio + un resumen neutral de 2-3 oraciones sobre
# lo que pasó — no una descripción de "cuántas fuentes lo cubrieron".
#
# Best-effort: si falla (sin DEEPSEEK_API_KEY, red, rate limit,
# respuesta mal formada), se loguea como advertencia y el pipeline
# sigue — el resumen no es crítico para ninguna fase posterior
# (anotación, entrenamiento, etc. no dependen de él).
# =============================================================

import json
import logging
import os

import requests

log = logging.getLogger(__name__)

MODEL = "deepseek-chat"
API_URL = "https://api.deepseek.com/chat/completions"
MAX_CUERPO_POR_ARTICULO = 3000  # caracteres — límite simple contra artículos atípicos
MAX_TOKENS_RESUMEN = 1024

SYSTEM_PROMPT = (
    "Eres el redactor de titulares y resúmenes de bias_scraper, un sistema "
    "de tesis que separa el sesgo ideológico del contenido factual en "
    "noticias mexicanas. Vas a recibir varios artículos de distintos "
    "medios que cubren el MISMO evento noticioso.\n\n"
    "Tu tarea:\n"
    "1. Escribe un TÍTULO claro e informativo del evento (una sola "
    "oración, estilo nota periodística — no una pregunta, no clickbait).\n"
    "2. Escribe un RESUMEN neutral de 2 a 3 oraciones sobre QUÉ PASÓ, "
    "basado en lo que las fuentes coinciden en reportar.\n\n"
    "Reglas para ambos:\n"
    "- No adoptes el encuadre ideológico de ningún medio en particular. "
    "Si los medios usan términos con carga política distinta para lo "
    "mismo (ej. \"disturbios\" vs \"protesta\", \"régimen\" vs "
    "\"gobierno\"), usa el término más neutral y verificable.\n"
    "- No opines ni evalúes lo ocurrido, solo repórtalo.\n"
    "- No menciones que estás resumiendo, ni cites los medios por "
    "nombre, ni digas \"varias fuentes reportan\" — escribe como si "
    "fuera la nota misma.\n\n"
    "Responde ÚNICAMENTE con un objeto JSON con exactamente las claves "
    "\"titulo\" y \"resumen\" (ambas string), sin texto adicional antes "
    "ni después."
)


def _construir_prompt(articulos: list) -> str:
    partes = []
    for art in articulos:
        cuerpo = (art.get("cuerpo") or "")[:MAX_CUERPO_POR_ARTICULO]
        partes.append(
            f"### Fuente: {art.get('fuente_nombre', 'desconocida')}\n"
            f"Titular original: {art.get('titular', '')}\n\n{cuerpo}"
        )
    return "\n\n---\n\n".join(partes)


def generar_resumen_evento(articulos: list) -> tuple[str, str] | None:
    """
    articulos: lista de dicts con 'titular', 'cuerpo' y 'fuente_nombre'.
    Retorna (titulo, resumen), o None si no se pudo generar.
    """
    if not articulos:
        return None

    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if not api_key:
        log.warning("[Resumen] DEEPSEEK_API_KEY no configurada — se omite.")
        return None

    try:
        from pydantic import BaseModel
    except ImportError as e:
        log.warning(f"[Resumen] Dependencia faltante ({e}) — se omite.")
        return None

    class TituloYResumen(BaseModel):
        titulo: str
        resumen: str

    try:
        response = requests.post(
            API_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": MODEL,
                "max_tokens": MAX_TOKENS_RESUMEN,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": _construir_prompt(articulos)},
                ],
            },
            timeout=60,
        )
        response.raise_for_status()
        contenido = response.json()["choices"][0]["message"]["content"]
        data = json.loads(contenido)
        resultado = TituloYResumen(**data)
        if not resultado.titulo.strip() or not resultado.resumen.strip():
            log.warning("[Resumen] DeepSeek devolvió título o resumen vacío — se omite.")
            return None
        return resultado.titulo.strip(), resultado.resumen.strip()
    except Exception as e:
        # Best-effort: cualquier falla (red, rate limit, API key inválida,
        # JSON mal formado, validación fallida, etc.) no debe tumbar el
        # pipeline — solo ese evento se queda sin resumen mejorado.
        log.warning(f"[Resumen] Error generando resumen: {e}")
        return None
