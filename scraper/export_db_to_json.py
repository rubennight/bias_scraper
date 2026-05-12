import json
from datetime import date, datetime
from pathlib import Path
from db import get_connection


def fetch_rows_as_dict(cursor):
    columns = [desc[0] for desc in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def load_all_tables(conn):
    with conn.cursor() as cur:
        tables = ["fuentes", "eventos", "articulos", "articulo_keywords"]
        data = {table: [] for table in tables}
        for table in tables:
            cur.execute(f"SELECT * FROM {table} ORDER BY id;")
            data[table] = fetch_rows_as_dict(cur)
        return data


def build_nested_dump(data):
    fuentes_by_id = {f["id"]: f for f in data["fuentes"]}
    keywords_by_article = {}
    for kw in data["articulo_keywords"]:
        keywords_by_article.setdefault(kw["articulo_id"], []).append(kw["keyword"])

    articulos = []
    for art in data["articulos"]:
        art_copy = dict(art)
        art_copy["keywords"] = keywords_by_article.get(art["id"], [])
        art_copy["fuente"] = fuentes_by_id.get(art["fuente_id"])
        articulos.append(art_copy)

    eventos = []
    articulos_por_evento = {}
    for art in articulos:
        articulos_por_evento.setdefault(art["evento_id"], []).append(art)

    for evento in data["eventos"]:
        evento_copy = dict(evento)
        evento_copy["articulos"] = articulos_por_evento.get(evento["id"], [])
        eventos.append(evento_copy)

    return {
        "fuentes": data["fuentes"],
        "eventos": data["eventos"],
        "articulos": data["articulos"],
        "articulo_keywords": data["articulo_keywords"],
        "nested": {
            "eventos": eventos,
        },
    }


def json_serializer(obj):
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    raise TypeError(f"No serializable: {type(obj).__name__}")


def export_to_json(path="db_dump.json"):
    conn = get_connection()
    try:
        data = load_all_tables(conn)
    finally:
        conn.close()

    dump = build_nested_dump(data)
    output_path = Path(path)
    output_path.write_text(json.dumps(dump, ensure_ascii=False, indent=2, default=json_serializer), encoding="utf-8")
    print(f"Export completo guardado en: {output_path}")


if __name__ == "__main__":
    export_to_json()
