# =============================================================
# db.py — Conexión y operaciones con PostgreSQL
# Toda interacción con la base de datos pasa por este archivo.
# Los demás archivos nunca tocan psycopg2 directamente.
# =============================================================

import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()


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
    Crea las 3 tablas si no existen.
    Seguro de ejecutar múltiples veces — no borra datos existentes.
    """
    sql = """
        CREATE TABLE IF NOT EXISTS fuentes (
            id          SERIAL PRIMARY KEY,
            nombre      TEXT NOT NULL,
            url_base    TEXT NOT NULL,
            orientacion TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS trends (
            id           SERIAL PRIMARY KEY,
            keyword      TEXT NOT NULL,
            volumen      INT,
            pais         TEXT DEFAULT 'MX',
            capturado_en TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS articulos (
            id           SERIAL PRIMARY KEY,
            trend_id     INT REFERENCES trends(id),
            fuente_id    INT REFERENCES fuentes(id),
            url          TEXT UNIQUE NOT NULL,
            titular      TEXT,
            cuerpo       TEXT,
            autor        TEXT,
            fecha_pub    TIMESTAMP,
            metodo       TEXT,
            scrapeado_en TIMESTAMP DEFAULT NOW()
        );
    """
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(sql)
    conn.commit()
    cur.close()
    conn.close()
    print("[DB] Tablas verificadas/creadas correctamente.")


def insertar_fuentes(fuentes: list):
    """
    Inserta los medios definidos en config.py.
    ON CONFLICT DO NOTHING = si ya existe, no hace nada.
    """
    conn = get_connection()
    cur = conn.cursor()
    for f in fuentes:
        cur.execute("""
            INSERT INTO fuentes (nombre, url_base, orientacion)
            VALUES (%s, %s, %s)
            ON CONFLICT DO NOTHING;
        """, (f["nombre"], f["url_base"], f["orientacion"]))
    conn.commit()
    cur.close()
    conn.close()
    print(f"[DB] {len(fuentes)} fuentes verificadas.")


def insertar_trend(keyword: str, volumen: int, categoria: str = None) -> int:
    """
    Inserta un trend capturado y retorna su id generado.
    Cada ejecución del pipeline genera trends nuevos con timestamp propio.
    categoria — categoría asignada por la lista blanca (politica, economia, etc.)
    """
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO trends (keyword, volumen, categoria)
        VALUES (%s, %s, %s)
        RETURNING id;
    """, (keyword, volumen, categoria))
    trend_id = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()
    return trend_id


def insertar_articulo(trend_id: int, fuente_id: int, datos: dict):
    """
    Inserta un artículo scrapeado.
    ON CONFLICT (url) DO NOTHING = si la URL ya existe en la BD, la ignora.
    Esto evita duplicados cuando el mismo artículo aparece en dos trends.
    """
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO articulos
            (trend_id, fuente_id, url, titular, cuerpo, autor, fecha_pub, metodo)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (url) DO NOTHING;
    """, (
        trend_id,
        fuente_id,
        datos["url"],
        datos["titular"],
        datos["cuerpo"],
        datos["autor"],
        datos["fecha_pub"],
        datos["metodo"],
    ))
    conn.commit()
    cur.close()
    conn.close()


def obtener_fuentes() -> list:
    """
    Retorna todas las fuentes registradas en la BD como lista de dicts.
    El pipeline usa esto para saber a qué medios scrapear.
    """
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT id, nombre, url_base, orientacion FROM fuentes;")
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [
        {"id": r[0], "nombre": r[1], "url_base": r[2], "orientacion": r[3]}
        for r in rows
    ]
