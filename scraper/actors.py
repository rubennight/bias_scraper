# =============================================================
# actors.py — Extracción de actores relevantes por evento
#
# Usa spaCy NER para identificar PER, ORG, LOC en las oraciones
# ya segmentadas. Clasifica el rol de cada mención con reglas
# lingüísticas y normaliza nombres para agrupar variantes.
#
# Uso:
#   python actors.py                    # procesar eventos sin actores
#   python actors.py --evento_id=32     # procesar un evento específico
#   python actors.py --reset            # borrar y re-extraer todo
# =============================================================

import re
import logging
import argparse
from collections import defaultdict
from db import get_connection

log = logging.getLogger(__name__)

try:
    import spacy
    nlp = spacy.load("es_core_news_lg")
except OSError:
    raise SystemExit(
        "\n[ERROR] Modelo spaCy no encontrado.\n"
        "Ejecuta: python -m spacy download es_core_news_lg\n"
    )

TIPOS_VALIDOS = {"PER", "ORG", "LOC"}

MAX_PALABRAS_ENT = {"PER": 5, "ORG": 8, "LOC": 5}

VERBOS_CITA = {
    "declarar", "afirmar", "señalar", "indicar", "confirmar",
    "anunciar", "informar", "asegurar", "explicar", "comentar",
    "manifestar", "expresar", "precisar", "advertir", "reconocer",
    "revelar", "sostener", "apuntar", "destacar", "subrayar",
    "mencionar", "reportar", "comunicar", "detallar", "aclarar",
    "denunciar", "exigir", "pedir", "solicitar", "decir",
}

MARCADORES_CITA = {
    "según", "de acuerdo con", "conforme a", "para",
    "a juicio de", "en palabras de", "en opinión de",
}

CARGOS = [
    (r"\bpresidente?\b", True),
    (r"\bgobernador(?:a)?\b", True),
    (r"\bsecretari[oa]\b", True),
    (r"\bministr[oa]\b", True),
    (r"\bfiscal\b", True),
    (r"\bsenador(?:a)?\b", True),
    (r"\bdiputad[oa]\b", True),
    (r"\bgener?al\b", True),
    (r"\bcomisionad[oa]\b", True),
    (r"\bdirector(?:a)?\b", True),
    (r"\btitular\b", True),
    (r"\bembajador(?:a)?\b", True),
    (r"\brector(?:a)?\b", True),
    (r"\balcalde(?:sa)?\b", True),
    (r"\bjuez(?:a)?\b", True),
    (r"\bex\s*(?:presidente|gobernador|secretari|fiscal|senador|diputad|director)\w*\b", True),
]
_CARGO_PATTERNS = [(re.compile(p, re.IGNORECASE), _) for p, _ in CARGOS]


# ══════════════════════════════════════════════════════════════
# NORMALIZACIÓN DE NOMBRES
# ══════════════════════════════════════════════════════════════

def normalizar_nombre(texto: str) -> str:
    """
    Normaliza un nombre de entidad para agrupar variantes.
    'Rubén Rocha Moya' y 'Rocha Moya' -> 'Rocha Moya'
    """
    t = texto.strip()
    t = re.sub(r"\s+", " ", t)
    t = t.strip(".,;:\"'«»()[]")
    if len(t) < 2:
        return ""
    return t


def son_mismo_actor(a: str, b: str) -> bool:
    """
    Determina si dos menciones refieren al mismo actor.
    Usa coincidencia de apellidos para PER.
    """
    pa = set(a.lower().split())
    pb = set(b.lower().split())
    if not pa or not pb:
        return False
    comunes = pa & pb
    stopwords = {"de", "del", "la", "el", "los", "las", "y", "e"}
    comunes -= stopwords
    if len(comunes) >= 1:
        mas_corto = min(len(pa - stopwords), len(pb - stopwords))
        if mas_corto > 0 and len(comunes) / mas_corto >= 0.5:
            return True
    return False


def agrupar_actores(menciones: list) -> dict:
    """
    Agrupa menciones por actor normalizado.
    Retorna {nombre_canónico: [menciones]}
    """
    grupos = {}
    orden = []

    for m in menciones:
        nombre = normalizar_nombre(m["texto_mencion"])
        if not nombre:
            continue

        encontrado = False
        for canonico in orden:
            if son_mismo_actor(nombre, canonico):
                grupos[canonico].append(m)
                encontrado = True
                break

        if not encontrado:
            grupos[nombre] = [m]
            orden.append(nombre)

    resultado = {}
    for canonico, grupo in grupos.items():
        nombres = [normalizar_nombre(m["texto_mencion"]) for m in grupo]
        mas_largo = max(nombres, key=len)
        resultado[mas_largo] = grupo

    return resultado


# ══════════════════════════════════════════════════════════════
# DETECCIÓN DE ROL
# ══════════════════════════════════════════════════════════════

def detectar_rol(doc, ent) -> str:
    """
    Clasifica el rol de una entidad en la oración.
    - 'citado':     aparece como fuente de una declaración
    - 'sujeto':     es el sujeto gramatical de la oración
    - 'mencionado': aparece referida sin ser sujeto ni citada
    """
    texto_lower = doc.text.lower()

    for marcador in MARCADORES_CITA:
        pos = texto_lower.find(marcador)
        if pos != -1 and pos < ent.start_char:
            return "citado"

    if doc.text.count('"') >= 2 or doc.text.count("«") >= 1:
        return "citado"

    for token in doc:
        if token.lemma_.lower() in VERBOS_CITA and token.pos_ == "VERB":
            for child in token.children:
                if child.dep_ in ("nsubj", "nsubj:pass") and child.idx >= ent.start_char and child.idx < ent.end_char:
                    return "citado"

    for token in ent:
        if token.dep_ in ("nsubj", "nsubj:pass"):
            return "sujeto"
        if token.head.dep_ in ("nsubj", "nsubj:pass") and token.head.idx >= ent.start_char and token.head.idx < ent.end_char:
            return "sujeto"

    return "mencionado"


def detectar_cargo(texto: str, ent_text: str) -> str | None:
    """Busca un cargo oficial cerca de la entidad."""
    lower = texto.lower()
    ent_pos = lower.find(ent_text.lower())
    if ent_pos == -1:
        return None

    ventana_inicio = max(0, ent_pos - 80)
    ventana_fin = min(len(lower), ent_pos + len(ent_text) + 80)
    contexto = lower[ventana_inicio:ventana_fin]

    for patron, _ in _CARGO_PATTERNS:
        match = patron.search(contexto)
        if match:
            fin_cargo = min(len(contexto), match.end() + 30)
            fragmento = contexto[match.start():fin_cargo].strip()
            fragmento = re.split(r"[,;.!?]", fragmento)[0].strip()
            fragmento = re.sub(r"\s+", " ", fragmento)
            if len(fragmento) > 60:
                fragmento = fragmento[:60].rsplit(" ", 1)[0]
            return fragmento

    return None


# ══════════════════════════════════════════════════════════════
# EXTRACCIÓN PRINCIPAL
# ══════════════════════════════════════════════════════════════

def extraer_actores_evento(evento_id: int) -> dict:
    """
    Extrae actores de todas las oraciones de un evento.
    Agrupa por nombre normalizado y calcula estadísticas.
    """
    conn = get_connection()
    cur  = conn.cursor()

    cur.execute("""
        SELECT o.id, o.texto, a.fuente_id
        FROM oraciones o
        JOIN articulos a ON a.id = o.articulo_id
        WHERE a.evento_id = %s
        ORDER BY o.id
    """, (evento_id,))
    oraciones = cur.fetchall()

    if not oraciones:
        cur.close()
        conn.close()
        return {"evento_id": evento_id, "actores": 0}

    menciones_raw = []
    batch = 100

    for i in range(0, len(oraciones), batch):
        lote = oraciones[i:i + batch]
        textos = [row[1] for row in lote]
        docs = list(nlp.pipe(textos))

        for (ora_id, texto, fuente_id), doc in zip(lote, docs):
            for ent in doc.ents:
                if ent.label_ not in TIPOS_VALIDOS:
                    continue
                nombre = normalizar_nombre(ent.text)
                if len(nombre) < 2:
                    continue
                n_palabras = len(nombre.split())
                if n_palabras > MAX_PALABRAS_ENT.get(ent.label_, 6):
                    continue

                rol = detectar_rol(doc, ent)
                cargo = detectar_cargo(texto, ent.text) if ent.label_ == "PER" else None

                menciones_raw.append({
                    "oracion_id":    ora_id,
                    "fuente_id":     fuente_id,
                    "texto_mencion": ent.text,
                    "tipo":          ent.label_,
                    "rol":           rol,
                    "cargo":         cargo,
                })

    por_tipo = defaultdict(list)
    for m in menciones_raw:
        por_tipo[m["tipo"]].append(m)

    actores_guardados = 0

    for tipo, menciones in por_tipo.items():
        grupos = agrupar_actores(menciones)

        for nombre_canonico, grupo in grupos.items():
            fuentes_distintas = len(set(m["fuente_id"] for m in grupo))
            total = len(grupo)

            cargos = [m["cargo"] for m in grupo if m.get("cargo")]
            cargo_final = max(set(cargos), key=cargos.count) if cargos else None

            try:
                cur.execute("""
                    INSERT INTO actores_evento
                        (evento_id, nombre_normalizado, tipo, cargo,
                         total_menciones, num_fuentes)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (evento_id, nombre_normalizado, tipo)
                    DO UPDATE SET
                        cargo           = COALESCE(EXCLUDED.cargo, actores_evento.cargo),
                        total_menciones = EXCLUDED.total_menciones,
                        num_fuentes     = EXCLUDED.num_fuentes
                    RETURNING id
                """, (evento_id, nombre_canonico, tipo, cargo_final,
                      total, fuentes_distintas))
                actor_id = cur.fetchone()[0]
            except Exception as e:
                log.warning(f"  Error insertando actor '{nombre_canonico}': {e}")
                conn.rollback()
                continue

            for m in grupo:
                cur.execute("""
                    INSERT INTO menciones_actor
                        (actor_id, oracion_id, fuente_id, texto_mencion, rol)
                    VALUES (%s, %s, %s, %s, %s)
                """, (actor_id, m["oracion_id"], m["fuente_id"],
                      m["texto_mencion"], m["rol"]))

            actores_guardados += 1

    conn.commit()
    cur.close()
    conn.close()

    log.info(f"[Actores] Evento #{evento_id}: {actores_guardados} actores, "
             f"{len(menciones_raw)} menciones")

    return {
        "evento_id": evento_id,
        "actores":   actores_guardados,
        "menciones": len(menciones_raw),
    }


def extraer_actores_nuevos() -> dict:
    """
    Extrae actores de todos los eventos que aún no tienen actores.
    Diseñado para correr al final del pipeline.
    """
    conn = get_connection()
    cur  = conn.cursor()

    cur.execute("""
        SELECT DISTINCT e.id
        FROM eventos e
        JOIN articulos a ON a.evento_id = e.id
        JOIN oraciones o ON o.articulo_id = a.id
        WHERE e.id NOT IN (
            SELECT DISTINCT evento_id FROM actores_evento
        )
        ORDER BY e.id
    """)
    evento_ids = [r[0] for r in cur.fetchall()]
    cur.close()
    conn.close()

    if not evento_ids:
        log.info("[Actores] Todos los eventos ya tienen actores extraídos.")
        return {"eventos_procesados": 0, "total_actores": 0}

    log.info(f"[Actores] {len(evento_ids)} eventos por procesar...")

    total_actores = 0
    for eid in evento_ids:
        res = extraer_actores_evento(eid)
        total_actores += res["actores"]

    return {
        "eventos_procesados": len(evento_ids),
        "total_actores":      total_actores,
    }


# ══════════════════════════════════════════════════════════════
# CLI
# ══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import sys
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)],
    )

    parser = argparse.ArgumentParser(description="bias_scraper — Extracción de actores")
    parser.add_argument("--evento_id", type=int, help="Procesar un evento específico")
    parser.add_argument("--reset", action="store_true", help="Borrar actores existentes y re-extraer")
    args = parser.parse_args()

    if args.reset:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("DELETE FROM menciones_actor;")
        cur.execute("DELETE FROM actores_evento;")
        conn.commit()
        cur.close()
        conn.close()
        log.info("[Actores] Tablas limpiadas.")

    if args.evento_id:
        res = extraer_actores_evento(args.evento_id)
        print(f"\nEvento #{args.evento_id}: {res['actores']} actores, {res['menciones']} menciones")
    else:
        res = extraer_actores_nuevos()
        print(f"\nResumen:")
        print(f"  Eventos procesados : {res['eventos_procesados']}")
        print(f"  Total actores      : {res['total_actores']}")
