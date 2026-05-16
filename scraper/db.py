# =============================================================
# db.py — Conexión y operaciones con PostgreSQL
# Toda interacción con la base de datos pasa por este archivo.
# Schema: fuentes → eventos → articulos → articulo_keywords
#         → oraciones → anotaciones ← anotadores
#         → sesiones_kappa
# =============================================================

import os
import logging
import psycopg2
from datetime import date
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))
log = logging.getLogger(__name__)


def get_connection():
    """Retorna una conexión activa a PostgreSQL."""
    return psycopg2.connect(
        host=os.getenv("DB_HOST"),
        port=os.getenv("DB_PORT"),
        dbname=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
    )


def crear_tablas():
    """
    Crea las 8 tablas si no existen.
    Seguro de ejecutar múltiples veces — no borra datos existentes.

    Esquema KDD completo:
    fuentes           → medios con orientación ideológica
    eventos           → clusters detectados con ventana ISO
    articulos         → cobertura de un evento por una fuente
    articulo_keywords → keywords TF-IDF por artículo
    oraciones         → oraciones segmentadas por spaCy (Fase 4)
    anotadores        → personas que anotan (Fase 4)
    anotaciones       → etiquetas A/B/C por oración por anotador
    sesiones_kappa    → resultados de acuerdo inter-anotador
    """
    sql = """
        CREATE TABLE IF NOT EXISTS fuentes (
            id          SERIAL PRIMARY KEY,
            nombre      TEXT NOT NULL UNIQUE,
            url_base    TEXT NOT NULL,
            orientacion TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS eventos (
            id              SERIAL PRIMARY KEY,
            titular_evento  TEXT NOT NULL,
            num_fuentes     INT NOT NULL,
            ventana_inicio  DATE NOT NULL,
            ventana_fin     DATE NOT NULL,
            detectado_en    TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS articulos (
            id           SERIAL PRIMARY KEY,
            evento_id    INT REFERENCES eventos(id),
            fuente_id    INT REFERENCES fuentes(id),
            url          TEXT UNIQUE NOT NULL,
            titular      TEXT,
            cuerpo       TEXT,
            autor        TEXT,
            fecha_pub    TIMESTAMP,
            metodo       TEXT,
            anotado      BOOLEAN DEFAULT FALSE,
            scrapeado_en TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS articulo_keywords (
            id          SERIAL PRIMARY KEY,
            articulo_id INT REFERENCES articulos(id) ON DELETE CASCADE,
            keyword     TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_keyword
            ON articulo_keywords(keyword);
        CREATE INDEX IF NOT EXISTS idx_articulo_kw
            ON articulo_keywords(articulo_id);

        -- ── FASE 4: Anotación A/B/C ──────────────────────────

        CREATE TABLE IF NOT EXISTS oraciones (
            id            SERIAL PRIMARY KEY,
            articulo_id   INT REFERENCES articulos(id) ON DELETE CASCADE,
            texto         TEXT NOT NULL,
            contexto_prev TEXT,
            contexto_sig  TEXT,
            posicion      INT NOT NULL,
            num_palabras  INT,
            creado_en     TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_oraciones_articulo
            ON oraciones(articulo_id);

        CREATE TABLE IF NOT EXISTS anotadores (
            id          SERIAL PRIMARY KEY,
            nombre      TEXT NOT NULL UNIQUE,
            descripcion TEXT,
            creado_en   TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS anotaciones (
            id             SERIAL PRIMARY KEY,
            oracion_id     INT REFERENCES oraciones(id) ON DELETE CASCADE,
            anotador_id    INT REFERENCES anotadores(id),
            version        INT NOT NULL DEFAULT 1,
            categoria      CHAR(1) NOT NULL CHECK (categoria IN ('A','B','C')),
            elemento_sesgo TEXT,
            alternativa    TEXT,
            confianza      TEXT CHECK (confianza IN ('alta','media','baja')),
            es_consenso    BOOLEAN DEFAULT FALSE,
            notas          TEXT,
            creado_en      TIMESTAMP DEFAULT NOW(),
            UNIQUE(oracion_id, anotador_id, version)
        );

        CREATE INDEX IF NOT EXISTS idx_anotaciones_oracion
            ON anotaciones(oracion_id);
        CREATE INDEX IF NOT EXISTS idx_anotaciones_anotador
            ON anotaciones(anotador_id);
        CREATE INDEX IF NOT EXISTS idx_anotaciones_categoria
            ON anotaciones(categoria);

        CREATE TABLE IF NOT EXISTS sesiones_kappa (
            id              SERIAL PRIMARY KEY,
            anotador1_id    INT REFERENCES anotadores(id),
            anotador2_id    INT REFERENCES anotadores(id),
            kappa_global    DECIMAL(4,3),
            kappa_A         DECIMAL(4,3),
            kappa_B         DECIMAL(4,3),
            kappa_C         DECIMAL(4,3),
            total_oraciones INT,
            acuerdo_pct     DECIMAL(5,2),
            valido          BOOLEAN,
            notas           TEXT,
            calculado_en    TIMESTAMP DEFAULT NOW()
        );
    """
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute(sql)
    conn.commit()
    cur.close()
    conn.close()
    log.info("[DB] Tablas verificadas/creadas correctamente.")


def insertar_fuentes(fuentes: list):
    """
    Inserta los medios definidos en config.py.
    ON CONFLICT DO NOTHING = si ya existe por nombre, no hace nada.
    """
    conn = get_connection()
    cur  = conn.cursor()
    for f in fuentes:
        cur.execute("""
            INSERT INTO fuentes (nombre, url_base, orientacion)
            VALUES (%s, %s, %s)
            ON CONFLICT (nombre) DO NOTHING;
        """, (f["nombre"], f["url_base"], f["orientacion"]))
    conn.commit()
    cur.close()
    conn.close()
    log.info(f"[DB] {len(fuentes)} fuentes verificadas.")


def insertar_evento(titular: str, num_fuentes: int,
                    ventana_inicio: date, ventana_fin: date) -> int:
    """
    Inserta un evento detectado por clustering y retorna su id.
    ventana_inicio y ventana_fin definen el rango temporal del cluster —
    garantizan que artículos de distintas semanas nunca se mezclan.
    """
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("""
        INSERT INTO eventos (titular_evento, num_fuentes, ventana_inicio, ventana_fin)
        VALUES (%s, %s, %s, %s)
        RETURNING id;
    """, (titular, num_fuentes, ventana_inicio, ventana_fin))
    evento_id = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()
    return evento_id


def eliminar_evento(evento_id: int):
    """Elimina un evento que quedó sin artículos (todos eran duplicados)."""
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("DELETE FROM eventos WHERE id = %s;", (evento_id,))
    conn.commit()
    cur.close()
    conn.close()
    log.info(f"[DB] Evento #{evento_id} eliminado (sin articulos nuevos).")


def insertar_articulo(evento_id: int, fuente_id: int, datos: dict) -> int | None:
    """
    Inserta un artículo scrapeado.
    Retorna el id del artículo insertado, o None si ya existía (URL duplicada).
    """
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("""
        INSERT INTO articulos
            (evento_id, fuente_id, url, titular, cuerpo, autor, fecha_pub, metodo)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (url) DO NOTHING
        RETURNING id;
    """, (
        evento_id, fuente_id,
        datos["url"], datos["titular"], datos["cuerpo"],
        datos["autor"], datos["fecha_pub"], datos["metodo"],
    ))
    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return row[0] if row else None


def insertar_keywords(articulo_id: int, keywords: list):
    """
    Inserta las keywords TF-IDF extraídas por Newspaper3k.
    Una fila por keyword — permite consultas eficientes por tema.
    """
    if not keywords:
        return
    conn = get_connection()
    cur  = conn.cursor()
    for kw in keywords:
        cur.execute("""
            INSERT INTO articulo_keywords (articulo_id, keyword)
            VALUES (%s, %s)
            ON CONFLICT DO NOTHING;
        """, (articulo_id, kw.lower().strip()))
    conn.commit()
    cur.close()
    conn.close()


def obtener_fuentes() -> list:
    """Retorna todas las fuentes como lista de dicts."""
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("SELECT id, nombre, url_base, orientacion FROM fuentes;")
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [
        {"id": r[0], "nombre": r[1], "url_base": r[2], "orientacion": r[3]}
        for r in rows
    ]


def obtener_evento_id_por_urls(urls: list) -> int | None:
    """
    Busca si alguna URL del cluster ya está en la BD con un evento_id.
    Si existe, retorna ese evento_id para que los artículos nuevos del
    mismo cluster se agreguen al evento existente en lugar de crear uno
    duplicado en re-ejecuciones de la misma semana.
    """
    if not urls:
        return None
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute(
        "SELECT evento_id FROM articulos WHERE url = ANY(%s) AND evento_id IS NOT NULL LIMIT 1;",
        (urls,)
    )
    row = cur.fetchone()
    cur.close()
    conn.close()
    return row[0] if row else None


def actualizar_num_fuentes(evento_id: int, num_fuentes: int):
    """Actualiza num_fuentes al valor máximo observado para el evento."""
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute(
        "UPDATE eventos SET num_fuentes = GREATEST(num_fuentes, %s) WHERE id = %s;",
        (num_fuentes, evento_id)
    )
    conn.commit()
    cur.close()
    conn.close()


def obtener_fuente_por_nombre(nombre: str) -> dict | None:
    """Busca una fuente por nombre exacto. Retorna None si no existe."""
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute(
        "SELECT id, nombre, url_base, orientacion FROM fuentes WHERE nombre = %s;",
        (nombre,)
    )
    row = cur.fetchone()
    cur.close()
    conn.close()
    if row:
        return {"id": row[0], "nombre": row[1], "url_base": row[2], "orientacion": row[3]}
    return None


def obtener_keywords_articulo(articulo_id: int) -> list:
    """Retorna las keywords de un artículo como lista de strings."""
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute(
        "SELECT keyword FROM articulo_keywords WHERE articulo_id = %s ORDER BY keyword;",
        (articulo_id,)
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [r[0] for r in rows]
