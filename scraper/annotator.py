# =============================================================
# annotator.py — KDD Fase 4: Segmentación y Anotación
#
# Este módulo tiene dos responsabilidades:
#
# 1. SEGMENTACIÓN: tomar los artículos guardados en PostgreSQL,
#    dividirlos en oraciones con spaCy es_core_news_lg, y guardar
#    cada oración en la tabla `oraciones` con su contexto.
#
# 2. UTILIDADES DE ANOTACIÓN: funciones para registrar anotadores,
#    guardar anotaciones A/B/C, y calcular Cohen's Kappa.
#
# Uso típico:
#   python annotator.py --segmentar          # segmentar artículos nuevos
#   python annotator.py --stats              # ver estado del corpus
# =============================================================

import logging
import argparse
from db import get_connection

log = logging.getLogger(__name__)

# ── Carga de spaCy (una sola vez) ────────────────────────────
try:
    import spacy
    nlp = spacy.load("es_core_news_lg")
    log.info("[Annotator] Modelo spaCy es_core_news_lg cargado.")
except OSError:
    # El modelo no está descargado — instrucciones claras
    raise SystemExit(
        "\n[ERROR] Modelo spaCy no encontrado.\n"
        "Ejecuta: python -m spacy download es_core_news_lg\n"
    )


# ══════════════════════════════════════════════════════════════
# SEGMENTACIÓN
# ══════════════════════════════════════════════════════════════

def segmentar_articulo(texto: str) -> list[dict]:
    """
    Divide el cuerpo de un artículo en oraciones con spaCy.

    Por cada oración retorna un dict con:
    - texto:       la oración limpia
    - posicion:    índice dentro del artículo (0, 1, 2...)
    - num_palabras: longitud en palabras

    Filtros de calidad aplicados:
    - Mínimo 5 palabras (evita fragmentos cortos)
    - Mínimo 20 caracteres
    - No empieza con comillas (citas directas del entrevistado,
      no del periodista — no aportan al análisis de sesgo)
    - No es solo puntuación o números
    """
    if not texto or len(texto.strip()) < 20:
        return []

    doc       = nlp(texto)
    oraciones = []

    for i, sent in enumerate(doc.sents):
        texto_limpio = sent.text.strip()

        # Filtros de calidad
        palabras = texto_limpio.split()
        if len(palabras) < 5:
            continue
        if len(texto_limpio) < 20:
            continue
        if texto_limpio.startswith(('"', "'", "«", "—")):
            continue
        if not any(c.isalpha() for c in texto_limpio):
            continue

        oraciones.append({
            "texto":       texto_limpio,
            "posicion":    i,
            "num_palabras": len(palabras),
        })

    return oraciones


def segmentar_articulos_nuevos() -> dict:
    """
    Segmenta todos los artículos que aún no tienen oraciones en la BD.

    Detecta artículos no segmentados comparando articulos.id con
    los articulo_id existentes en la tabla oraciones.

    Para cada oración guardada incluye:
    - contexto_prev: oración anterior (ayuda al anotador a entender)
    - contexto_sig:  oración siguiente

    Retorna un resumen con totales.
    """
    conn = get_connection()
    cur  = conn.cursor()

    # Artículos que tienen cuerpo pero NO tienen oraciones aún
    cur.execute("""
        SELECT a.id, a.titular, a.cuerpo
        FROM articulos a
        WHERE a.cuerpo IS NOT NULL
          AND a.cuerpo != ''
          AND a.id NOT IN (
              SELECT DISTINCT articulo_id FROM oraciones
          )
        ORDER BY a.id;
    """)
    articulos = cur.fetchall()

    if not articulos:
        log.info("[Segmentación] Todos los artículos ya están segmentados.")
        cur.close()
        conn.close()
        return {"articulos_procesados": 0, "oraciones_creadas": 0}

    log.info(f"[Segmentación] {len(articulos)} artículos por segmentar...")

    total_oraciones = 0

    for art_id, titular, cuerpo in articulos:
        oraciones = segmentar_articulo(cuerpo)

        if not oraciones:
            log.info(f"  [!] Art #{art_id} sin oraciones válidas: {titular[:50]}")
            continue

        # Agregar contexto previo y siguiente
        for j, ora in enumerate(oraciones):
            ora["contexto_prev"] = oraciones[j - 1]["texto"] if j > 0 else None
            ora["contexto_sig"]  = oraciones[j + 1]["texto"] if j < len(oraciones) - 1 else None

        # Insertar en BD
        for ora in oraciones:
            cur.execute("""
                INSERT INTO oraciones
                    (articulo_id, texto, contexto_prev, contexto_sig,
                     posicion, num_palabras)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING;
            """, (
                art_id,
                ora["texto"],
                ora["contexto_prev"],
                ora["contexto_sig"],
                ora["posicion"],
                ora["num_palabras"],
            ))

        total_oraciones += len(oraciones)
        log.info(f"  ✓ Art #{art_id}: {len(oraciones)} oraciones — {titular[:50]}")

    conn.commit()
    cur.close()
    conn.close()

    resumen = {
        "articulos_procesados": len(articulos),
        "oraciones_creadas":    total_oraciones,
    }
    log.info(f"[Segmentación] Listo: {total_oraciones} oraciones de {len(articulos)} artículos")
    return resumen


# ══════════════════════════════════════════════════════════════
# GESTIÓN DE ANOTADORES
# ══════════════════════════════════════════════════════════════

def registrar_anotador(nombre: str, descripcion: str = "") -> int:
    """
    Registra un anotador humano en la BD.
    Si ya existe con ese nombre, retorna su id existente.

    Ejemplo:
        id = registrar_anotador("Blanca", "Autora de la tesis")
        id = registrar_anotador("Anotador2", "Segundo revisor")
    """
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("""
        INSERT INTO anotadores (nombre, descripcion)
        VALUES (%s, %s)
        ON CONFLICT (nombre) DO UPDATE SET descripcion = EXCLUDED.descripcion
        RETURNING id;
    """, (nombre, descripcion))
    anotador_id = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()
    log.info(f"[Anotador] '{nombre}' registrado con id={anotador_id}")
    return anotador_id


def obtener_anotadores() -> list:
    """Retorna todos los anotadores registrados."""
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("SELECT id, nombre, descripcion, creado_en FROM anotadores ORDER BY id;")
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [{"id": r[0], "nombre": r[1], "descripcion": r[2], "creado_en": r[3]} for r in rows]


# ══════════════════════════════════════════════════════════════
# ANOTACIONES
# ══════════════════════════════════════════════════════════════

def guardar_anotacion(
    oracion_id:     int,
    anotador_id:    int,
    categoria:      str,
    elemento_sesgo: str  = None,
    alternativa:    str  = None,
    confianza:      str  = "alta",
    notas:          str  = None,
    version:        int  = 1,
    es_consenso:    bool = False,
) -> int:
    """
    Guarda una anotación A/B/C para una oración.

    Si ya existe una anotación del mismo anotador en la misma versión,
    la actualiza en lugar de insertar un duplicado.

    Parámetros:
    - categoria:      'A', 'B' o 'C'
    - elemento_sesgo: palabra o frase con sesgo (obligatorio si B o C)
    - alternativa:    versión más neutral (obligatorio si B o C)
    - confianza:      'alta', 'media' o 'baja'
    - version:        permite re-anotar (v1 original, v2 revisión, etc.)
    - es_consenso:    True si fue resultado de discusión entre anotadores
    """
    assert categoria in ("A", "B", "C"), f"Categoría inválida: {categoria}"
    assert confianza in ("alta", "media", "baja"), f"Confianza inválida: {confianza}"

    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("""
        INSERT INTO anotaciones
            (oracion_id, anotador_id, version, categoria,
             elemento_sesgo, alternativa, confianza, notas, es_consenso)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (oracion_id, anotador_id, version)
        DO UPDATE SET
            categoria      = EXCLUDED.categoria,
            elemento_sesgo = EXCLUDED.elemento_sesgo,
            alternativa    = EXCLUDED.alternativa,
            confianza      = EXCLUDED.confianza,
            notas          = EXCLUDED.notas,
            es_consenso    = EXCLUDED.es_consenso
        RETURNING id;
    """, (
        oracion_id, anotador_id, version, categoria,
        elemento_sesgo, alternativa, confianza, notas, es_consenso,
    ))
    anotacion_id = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()
    return anotacion_id


def obtener_oraciones_para_anotar(
    anotador_id: int,
    evento_id:   int  = None,
    limite:      int  = 50,
    version:     int  = 1,
) -> list:
    """
    Retorna oraciones que este anotador aún no ha anotado
    en la versión especificada.

    Si se especifica evento_id, filtra por ese evento.
    Incluye el contexto previo y siguiente para facilitar la anotación.
    Ordenadas por articulo_id y posición para mantener coherencia narrativa.
    """
    conn = get_connection()
    cur  = conn.cursor()

    filtro_evento = "AND a.evento_id = %s" if evento_id else ""
    params = [anotador_id, version]
    if evento_id:
        params.append(evento_id)
    params.append(limite)

    cur.execute(f"""
        SELECT
            o.id,
            o.texto,
            o.contexto_prev,
            o.contexto_sig,
            o.posicion,
            a.titular        AS titular_articulo,
            f.nombre         AS fuente,
            f.orientacion,
            ev.titular_evento
        FROM oraciones o
        JOIN articulos a  ON a.id  = o.articulo_id
        JOIN fuentes   f  ON f.id  = a.fuente_id
        JOIN eventos   ev ON ev.id = a.evento_id
        WHERE o.id NOT IN (
            SELECT oracion_id FROM anotaciones
            WHERE anotador_id = %s AND version = %s
        )
        {filtro_evento}
        ORDER BY o.articulo_id, o.posicion
        LIMIT %s;
    """, params)

    rows = cur.fetchall()
    cur.close()
    conn.close()

    return [{
        "id":              r[0],
        "texto":           r[1],
        "contexto_prev":   r[2],
        "contexto_sig":    r[3],
        "posicion":        r[4],
        "titular_articulo": r[5],
        "fuente":          r[6],
        "orientacion":     r[7],
        "titular_evento":  r[8],
    } for r in rows]


# ══════════════════════════════════════════════════════════════
# COHEN'S KAPPA
# ══════════════════════════════════════════════════════════════

def calcular_kappa(anotador1_id: int, anotador2_id: int, version: int = 1) -> dict:
    """
    Calcula Cohen's Kappa entre dos anotadores sobre las oraciones
    que ambos hayan anotado en la misma versión.

    Kappa = (Po - Pe) / (1 - Pe)
    Po = proporción de acuerdo observado
    Pe = proporción de acuerdo esperado por azar

    Escala (Landis & Koch, 1977):
    < 0.20  → insignificante
    0.20-0.40 → leve
    0.40-0.60 → moderado
    0.60-0.80 → sustancial  ← mínimo requerido (κ ≥ 0.6)
    0.80-1.00 → casi perfecto

    Retorna dict con kappa_global, kappa por categoría,
    total de oraciones comparadas, y si es válido (κ ≥ 0.6).
    """
    from sklearn.metrics import cohen_kappa_score

    conn = get_connection()
    cur  = conn.cursor()

    # Oraciones anotadas por AMBOS anotadores en la misma versión
    cur.execute("""
        SELECT
            a1.oracion_id,
            a1.categoria AS cat1,
            a2.categoria AS cat2
        FROM anotaciones a1
        JOIN anotaciones a2
            ON a1.oracion_id = a2.oracion_id
           AND a2.anotador_id = %s
           AND a2.version     = %s
        WHERE a1.anotador_id = %s
          AND a1.version     = %s
        ORDER BY a1.oracion_id;
    """, (anotador2_id, version, anotador1_id, version))

    rows = cur.fetchall()
    cur.close()
    conn.close()

    if len(rows) < 10:
        log.warning(f"[Kappa] Solo {len(rows)} oraciones compartidas — poco confiable.")

    etiquetas1 = [r[1] for r in rows]
    etiquetas2 = [r[2] for r in rows]

    # Kappa global
    kappa_global = cohen_kappa_score(etiquetas1, etiquetas2)

    # Kappa por categoría (one-vs-rest)
    def kappa_cat(cat):
        y1 = [1 if e == cat else 0 for e in etiquetas1]
        y2 = [1 if e == cat else 0 for e in etiquetas2]
        if sum(y1) == 0 and sum(y2) == 0:
            return None  # categoría ausente
        return cohen_kappa_score(y1, y2)

    acuerdos = sum(1 for a, b in zip(etiquetas1, etiquetas2) if a == b)
    acuerdo_pct = (acuerdos / len(rows) * 100) if rows else 0

    resultado = {
        "kappa_global":    round(kappa_global, 3),
        "kappa_A":         round(kappa_cat("A"), 3) if kappa_cat("A") is not None else None,
        "kappa_B":         round(kappa_cat("B"), 3) if kappa_cat("B") is not None else None,
        "kappa_C":         round(kappa_cat("C"), 3) if kappa_cat("C") is not None else None,
        "total_oraciones": len(rows),
        "acuerdo_pct":     round(acuerdo_pct, 2),
        "valido":          kappa_global >= 0.6,
    }

    log.info(f"[Kappa] κ={kappa_global:.3f} | Acuerdo={acuerdo_pct:.1f}% | "
             f"N={len(rows)} | {'✓ VÁLIDO' if resultado['valido'] else '✗ BAJO UMBRAL'}")

    return resultado


def guardar_sesion_kappa(
    anotador1_id: int,
    anotador2_id: int,
    resultado:    dict,
    notas:        str = None,
) -> int:
    """
    Guarda el resultado de un cálculo de Kappa en sesiones_kappa.
    Retorna el id de la sesión guardada.
    """
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("""
        INSERT INTO sesiones_kappa
            (anotador1_id, anotador2_id, kappa_global, kappa_A, kappa_B,
             kappa_C, total_oraciones, acuerdo_pct, valido, notas)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id;
    """, (
        anotador1_id, anotador2_id,
        resultado["kappa_global"],
        resultado.get("kappa_A"),
        resultado.get("kappa_B"),
        resultado.get("kappa_C"),
        resultado["total_oraciones"],
        resultado["acuerdo_pct"],
        resultado["valido"],
        notas,
    ))
    sesion_id = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()
    log.info(f"[Kappa] Sesión #{sesion_id} guardada.")
    return sesion_id


# ══════════════════════════════════════════════════════════════
# ESTADÍSTICAS DEL CORPUS
# ══════════════════════════════════════════════════════════════

def stats_corpus() -> dict:
    """
    Retorna estadísticas del estado actual del corpus de anotación.
    Útil para monitorear el avance antes de entrenar el clasificador.
    """
    conn = get_connection()
    cur  = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM oraciones;")
    total_oraciones = cur.fetchone()[0]

    cur.execute("SELECT COUNT(DISTINCT articulo_id) FROM oraciones;")
    articulos_segmentados = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM anotaciones WHERE version = 1;")
    total_anotaciones = cur.fetchone()[0]

    cur.execute("""
        SELECT categoria, COUNT(*) FROM anotaciones
        WHERE version = 1
        GROUP BY categoria ORDER BY categoria;
    """)
    por_categoria = {r[0]: r[1] for r in cur.fetchall()}

    cur.execute("""
        SELECT anotador_id, COUNT(*) FROM anotaciones
        WHERE version = 1
        GROUP BY anotador_id;
    """)
    por_anotador_raw = cur.fetchall()

    cur.execute("SELECT id, nombre FROM anotadores;")
    nombres = {r[0]: r[1] for r in cur.fetchall()}

    por_anotador = {nombres.get(r[0], f"id:{r[0]}"): r[1] for r in por_anotador_raw}

    cur.execute("""
        SELECT kappa_global, valido, calculado_en
        FROM sesiones_kappa ORDER BY calculado_en DESC LIMIT 1;
    """)
    ultimo_kappa = cur.fetchone()

    cur.close()
    conn.close()

    return {
        "total_oraciones":      total_oraciones,
        "articulos_segmentados": articulos_segmentados,
        "total_anotaciones":    total_anotaciones,
        "por_categoria":        por_categoria,
        "por_anotador":         por_anotador,
        "ultimo_kappa":         {
            "valor":  ultimo_kappa[0] if ultimo_kappa else None,
            "valido": ultimo_kappa[1] if ultimo_kappa else None,
            "fecha":  str(ultimo_kappa[2])[:10] if ultimo_kappa else None,
        },
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

    parser = argparse.ArgumentParser(description="bias_scraper — Fase 4: Anotación")
    parser.add_argument("--segmentar",  action="store_true", help="Segmentar artículos nuevos en oraciones")
    parser.add_argument("--stats",      action="store_true", help="Ver estado del corpus de anotación")
    args = parser.parse_args()

    if args.segmentar:
        resultado = segmentar_articulos_nuevos()
        print(f"\nResumen:")
        print(f"  Artículos procesados : {resultado['articulos_procesados']}")
        print(f"  Oraciones creadas    : {resultado['oraciones_creadas']}")

    elif args.stats:
        s = stats_corpus()
        print(f"\n=== Estado del corpus de anotación ===")
        print(f"  Oraciones totales    : {s['total_oraciones']}")
        print(f"  Artículos segmentados: {s['articulos_segmentados']}")
        print(f"  Anotaciones (v1)     : {s['total_anotaciones']}")
        print(f"  Por categoría        : {s['por_categoria']}")
        print(f"  Por anotador         : {s['por_anotador']}")
        if s['ultimo_kappa']['valor']:
            valido = "✓ VÁLIDO" if s['ultimo_kappa']['valido'] else "✗ BAJO UMBRAL"
            print(f"  Último Kappa         : {s['ultimo_kappa']['valor']} {valido} ({s['ultimo_kappa']['fecha']})")
        else:
            print(f"  Último Kappa         : sin calcular aún")

    else:
        parser.print_help()
