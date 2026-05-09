# =============================================================
# db.py — Conexión y operaciones con PostgreSQL
# Toda interacción con la base de datos pasa por este archivo.
# Schema: fuentes → eventos → articulos → articulo_keywords
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
    Crea las 4 tablas si no existen.
    Seguro de ejecutar múltiples veces — no borra datos existentes.

    Esquema:
    fuentes           → medios de comunicación con orientación ideológica
    eventos           → clusters de artículos sobre el mismo hecho real
                        ventana_inicio/fin definen el rango temporal del evento
    articulos         → cobertura específica de un evento por una fuente
    articulo_keywords → keywords TF-IDF por artículo (una fila por keyword)
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
