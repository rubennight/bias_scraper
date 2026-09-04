"""
Diagnóstico temporal — evento #144. NO forma parte del pipeline.
Prueba la hipótesis: a diferencia del evento #131 (keywords GLOBALMENTE
genéricas como "trump"), aquí no hay ninguna keyword global-genérica
involucrada — el problema es que "sinaloa"/"rocha"/"moya" son
extremadamente frecuentes DENTRO de este cluster particular (alta
frecuencia local), y el grafo actual no pondera eso (no hay IDF real
sobre el pool de candidatos de la semana, solo conteo crudo de
keywords compartidas).
"""
import sys, os
from collections import defaultdict

sys.path.insert(0, os.path.dirname(__file__))
from db import get_connection

EVENTO_ID = 144
MIN_KEYWORDS_COMPARTIDAS = 4


def cargar_articulos(cur, evento_id):
    cur.execute("""
        SELECT a.id, a.titular, a.fuente_id, f.nombre
        FROM articulos a JOIN fuentes f ON f.id = a.fuente_id
        WHERE a.evento_id = %s
    """, (evento_id,))
    articulos = {}
    for aid, titular, fuente_id, fuente_nombre in cur.fetchall():
        articulos[aid] = {"titular": titular, "fuente_id": fuente_id, "fuente": fuente_nombre, "keywords": set()}

    cur.execute("""
        SELECT k.articulo_id, k.keyword
        FROM articulo_keywords k JOIN articulos a ON a.id = k.articulo_id
        WHERE a.evento_id = %s
    """, (evento_id,))
    for aid, kw in cur.fetchall():
        if aid in articulos:
            articulos[aid]["keywords"].add(kw)
    return articulos


def frecuencia_documental(articulos):
    df = defaultdict(int)
    for art in articulos.values():
        for kw in art["keywords"]:
            df[kw] += 1
    return df


def construir_grafo(articulos, df, doc_freq_max=None):
    n = len(articulos)
    ids = list(articulos.keys())
    grafo = defaultdict(set)
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            a, b = articulos[ids[i]], articulos[ids[j]]
            if a["fuente_id"] == b["fuente_id"]:
                continue
            kw_a = a["keywords"]
            kw_b = b["keywords"]
            comunes = kw_a & kw_b
            if doc_freq_max is not None:
                comunes = {kw for kw in comunes if df[kw] <= doc_freq_max}
            if len(comunes) >= MIN_KEYWORDS_COMPARTIDAS:
                grafo[ids[i]].add(ids[j])
                grafo[ids[j]].add(ids[i])
    return grafo


def componentes(articulos, grafo):
    visitados = set()
    comps = []
    for aid in articulos:
        if aid in visitados:
            continue
        cola = [aid]
        comp = []
        while cola:
            actual = cola.pop(0)
            if actual in visitados:
                continue
            visitados.add(actual)
            comp.append(actual)
            for vecino in grafo.get(actual, []):
                if vecino not in visitados:
                    cola.append(vecino)
        comps.append(comp)
    return comps


def resumen(articulos, comps, min_fuentes=3):
    comps = sorted(comps, key=len, reverse=True)
    for comp in comps:
        fuentes = {articulos[a]["fuente"] for a in comp}
        if len(comp) < 2 or len(fuentes) < min_fuentes:
            continue
        print(f"\n--- {len(comp)} artículos, {len(fuentes)} fuentes ---")
        for aid in comp[:6]:
            print(f"  [{aid}] {articulos[aid]['titular'][:75]}")
        if len(comp) > 6:
            print(f"  ... y {len(comp)-6} más")


def main():
    conn = get_connection()
    cur = conn.cursor()
    articulos = cargar_articulos(cur, EVENTO_ID)
    n = len(articulos)
    print(f"Evento {EVENTO_ID}: {n} artículos\n")

    df = frecuencia_documental(articulos)

    print("=" * 70)
    print("ANTES (comportamiento actual — conteo crudo, sin ponderar frecuencia)")
    print("=" * 70)
    grafo = construir_grafo(articulos, df, doc_freq_max=None)
    resumen(articulos, componentes(articulos, grafo))

    # Simula IDF real: descarta keywords que aparecen en más del 20%
    # de los artículos de ESTE cluster (equivalente a document frequency
    # alta dentro del pool candidato de la semana).
    umbral = max(1, int(n * 0.20))
    print(f"\n\n{'=' * 70}")
    print(f"DESPUÉS (ignora keywords presentes en >{umbral} de {n} artículos del cluster — simula IDF local)")
    print("=" * 70)
    grafo2 = construir_grafo(articulos, df, doc_freq_max=umbral)
    resumen(articulos, componentes(articulos, grafo2))

    print(f"\n\nKeywords más frecuentes dentro del cluster (candidatas a excluirse con IDF local):")
    top = sorted(df.items(), key=lambda x: -x[1])[:10]
    for kw, cnt in top:
        marca = " <- excluida" if cnt > umbral else ""
        print(f"  {kw}: {cnt}/{n} artículos{marca}")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
