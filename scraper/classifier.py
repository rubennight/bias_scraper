# =============================================================
# classifier.py — KDD Fase 5: Entrenamiento del clasificador
#
# Flujo:
# 1. Cargar dataset anotado desde PostgreSQL
# 2. Extraer ~37 features lingüísticas por oración
# 3. Entrenar XGBoost con 5-fold cross-validation
# 4. Calcular F1/Precisión/Recall por categoría + SHAP
# 5. Guardar modelo como models/modelo_{job_id}.pkl
# 6. Escribir resultados en tabla entrenamientos
#
# Uso:
#   python classifier.py --job_id=1
#   python classifier.py --job_id=1 --min_oraciones=300
# =============================================================

import os
import sys
import json
import logging
import argparse
import pickle
from datetime import datetime
from pathlib import Path

import psycopg2
from db import get_connection

log = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

# Carpeta donde se guardan los modelos
MODELS_DIR = Path(__file__).parent / "models"
MODELS_DIR.mkdir(exist_ok=True)


# ══════════════════════════════════════════════════════════════
# UTILIDADES DE PROGRESO EN BD
# ══════════════════════════════════════════════════════════════

def actualizar_progreso(job_id: int, progreso: int, mensaje: str, estado: str = "corriendo"):
    """Escribe el estado actual del entrenamiento en la BD."""
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("""
        UPDATE entrenamientos
        SET estado = %s, progreso = %s, mensaje = %s
        WHERE id = %s
    """, (estado, progreso, mensaje, job_id))
    conn.commit()
    cur.close()
    conn.close()
    log.info(f"[{progreso}%] {mensaje}")


def marcar_error(job_id: int, error: str):
    """Marca el entrenamiento como fallido."""
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("""
        UPDATE entrenamientos
        SET estado = 'error', progreso = 0,
            mensaje = %s, error_msg = %s,
            completado_en = NOW()
        WHERE id = %s
    """, (f"Error: {error[:100]}", error, job_id))
    conn.commit()
    cur.close()
    conn.close()
    log.error(f"[Classifier] Error: {error}")


def guardar_resultados(job_id: int, resultados: dict, modelo_path: str):
    """Guarda los resultados finales del entrenamiento en la BD."""
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("""
        UPDATE entrenamientos SET
            estado           = 'completado',
            progreso         = 100,
            mensaje          = 'Entrenamiento completado exitosamente',
            total_oraciones  = %s,
            f1_global        = %s,
            f1_A             = %s,
            f1_B             = %s,
            f1_C             = %s,
            precision_A      = %s,
            precision_B      = %s,
            precision_C      = %s,
            recall_A         = %s,
            recall_B         = %s,
            recall_C         = %s,
            kappa_dataset    = %s,
            modelo_path      = %s,
            shap_features    = %s,
            confusion_matrix = %s,
            completado_en    = NOW()
        WHERE id = %s
    """, (
        resultados["total_oraciones"],
        resultados["f1_global"],
        resultados["f1"]["A"], resultados["f1"]["B"], resultados["f1"]["C"],
        resultados["precision"]["A"], resultados["precision"]["B"], resultados["precision"]["C"],
        resultados["recall"]["A"], resultados["recall"]["B"], resultados["recall"]["C"],
        resultados.get("kappa_dataset"),
        modelo_path,
        json.dumps(resultados["shap_features"], ensure_ascii=False),
        json.dumps(resultados["confusion_matrix"], ensure_ascii=False),
        job_id,
    ))
    conn.commit()
    cur.close()
    conn.close()


# ══════════════════════════════════════════════════════════════
# CARGA DEL DATASET
# ══════════════════════════════════════════════════════════════

def cargar_dataset(min_oraciones: int = 300) -> tuple:
    """
    Carga las oraciones anotadas con consenso o por un único anotador.

    Estrategia de selección:
    - Si una oración tiene anotación de consenso (es_consenso=True) → usa esa
    - Si tiene dos anotaciones que coinciden → usa cualquiera
    - Si tiene una sola anotación → la incluye (corpus pequeño)
    - Si las dos anotaciones discrepan y no hay consenso → descarta

    Retorna (textos, categorias, oracion_ids)
    """
    conn = get_connection()
    cur  = conn.cursor()

    # Oraciones con consenso explícito
    cur.execute("""
        SELECT o.id, o.texto, an.categoria
        FROM oraciones o
        JOIN anotaciones an ON an.oracion_id = o.id
        WHERE an.es_consenso = TRUE AND an.version = 1
        ORDER BY o.id
    """)
    consenso = cur.fetchall()

    # Oraciones con acuerdo entre dos anotadores
    cur.execute("""
        SELECT o.id, o.texto, a1.categoria
        FROM oraciones o
        JOIN anotaciones a1 ON a1.oracion_id = o.id AND a1.version = 1
        JOIN anotaciones a2 ON a2.oracion_id = o.id AND a2.version = 1
            AND a2.anotador_id != a1.anotador_id
            AND a2.categoria = a1.categoria
        WHERE o.id NOT IN (
            SELECT oracion_id FROM anotaciones WHERE es_consenso = TRUE
        )
        GROUP BY o.id, o.texto, a1.categoria
        ORDER BY o.id
    """)
    acuerdo = cur.fetchall()

    # Oraciones con un solo anotador (solo si dataset pequeño)
    cur.execute("""
        SELECT o.id, o.texto, an.categoria
        FROM oraciones o
        JOIN anotaciones an ON an.oracion_id = o.id AND an.version = 1
        WHERE o.id NOT IN (
            SELECT DISTINCT oracion_id FROM anotaciones
            WHERE es_consenso = TRUE
        )
        AND o.id NOT IN (
            SELECT o2.id FROM oraciones o2
            JOIN anotaciones a1 ON a1.oracion_id = o2.id AND a1.version = 1
            JOIN anotaciones a2 ON a2.oracion_id = o2.id AND a2.version = 1
                AND a2.anotador_id != a1.anotador_id
        )
        ORDER BY o.id
    """)
    solo_uno = cur.fetchall()

    cur.close()
    conn.close()

    # Combinar priorizando consenso > acuerdo > único anotador
    vistos = set()
    filas  = []
    for fila in consenso + acuerdo + solo_uno:
        if fila[0] not in vistos:
            filas.append(fila)
            vistos.add(fila[0])

    if len(filas) < min_oraciones:
        raise ValueError(
            f"Dataset insuficiente: {len(filas)} oraciones "
            f"(mínimo requerido: {min_oraciones}). "
            f"Anota más oraciones antes de entrenar."
        )

    ids       = [r[0] for r in filas]
    textos    = [r[1] for r in filas]
    categorias = [r[2] for r in filas]

    log.info(f"[Dataset] {len(filas)} oraciones cargadas")
    from collections import Counter
    dist = Counter(categorias)
    log.info(f"[Dataset] Distribución: A={dist['A']} B={dist['B']} C={dist['C']}")

    return textos, categorias, ids


# ══════════════════════════════════════════════════════════════
# EXTRACCIÓN DE FEATURES
# ══════════════════════════════════════════════════════════════

def extraer_features(textos: list, job_id: int) -> list:
    """
    Extrae ~37 features lingüísticas por oración.

    Grupos de features:
    - Léxicas (spaCy): adjetivos, adverbios, hedges, stop words
    - Sintácticas (spaCy): POS tags, verbos factivos/eval., NER
    - Sentimiento (pysentimiento): pos/neg/neu scores
    - Superficie: longitud, puntuación, cifras
    """
    import spacy
    from pysentimiento import create_analyzer

    actualizar_progreso(job_id, 25, "Cargando modelos lingüísticos...")

    nlp      = spacy.load("es_core_news_lg")
    analyzer = create_analyzer(task="sentiment", lang="es")

    # Palabras hedge en español — señalan incertidumbre o atribución
    HEDGES = {
        "supuestamente", "presuntamente", "aparentemente",
        "al parecer", "según", "se dice", "se afirma",
        "se asegura", "habría", "habrían", "podría", "podrían",
    }

    # Verbos factivos — introducen hechos verificables
    VERBOS_FACTIVOS = {
        "declarar", "afirmar", "señalar", "indicar", "confirmar",
        "anunciar", "informar", "publicar", "presentar", "firmar",
        "aprobar", "rechazar", "votar", "designar", "nombrar",
    }

    # Verbos evaluativos — introducen juicios de valor
    VERBOS_EVALUATIVOS = {
        "atacar", "criticar", "acusar", "denunciar", "reprochar",
        "culpar", "defender", "elogiar", "celebrar", "lamentar",
        "condenar", "aplaudir", "exigir", "demandar", "advertir",
    }

    actualizar_progreso(job_id, 35, f"Extrayendo features de {len(textos)} oraciones...")

    features = []
    batch    = 50  # procesar en lotes para no saturar memoria

    for i in range(0, len(textos), batch):
        lote = textos[i:i + batch]
        docs = list(nlp.pipe(lote))

        for doc, texto in zip(docs, lote):
            tokens     = [t for t in doc if not t.is_space]
            n          = max(len(tokens), 1)
            palabras   = [t.text.lower() for t in tokens]

            # ── Léxicas ──────────────────────────────────────
            n_adj      = sum(1 for t in tokens if t.pos_ == "ADJ")
            n_adv      = sum(1 for t in tokens if t.pos_ == "ADV")
            n_stop     = sum(1 for t in tokens if t.is_stop)
            n_sustant  = sum(1 for t in tokens if t.pos_ == "NOUN")
            n_verb     = sum(1 for t in tokens if t.pos_ == "VERB")
            n_propn    = sum(1 for t in tokens if t.pos_ == "PROPN")

            tiene_hedge    = int(any(h in texto.lower() for h in HEDGES))
            tiene_factivo  = int(any(t.lemma_.lower() in VERBOS_FACTIVOS for t in tokens if t.pos_ == "VERB"))
            tiene_eval     = int(any(t.lemma_.lower() in VERBOS_EVALUATIVOS for t in tokens if t.pos_ == "VERB"))

            # ── Sintácticas ──────────────────────────────────
            n_ent      = len(doc.ents)
            prof_arbol = max((t.head.i - t.i for t in tokens if t.head != t), default=0)
            n_neg      = sum(1 for t in tokens if t.dep_ == "neg")

            # ── Sentimiento ──────────────────────────────────
            try:
                sent       = analyzer.predict(texto[:512])
                score_pos  = sent.probas.get("POS", 0.0)
                score_neg  = sent.probas.get("NEG", 0.0)
                score_neu  = sent.probas.get("NEU", 0.0)
                polaridad  = score_pos - score_neg
            except Exception:
                score_pos = score_neg = score_neu = 0.0
                polaridad = 0.0

            # ── Superficie ───────────────────────────────────
            longitud       = len(tokens)
            n_mayus        = sum(1 for t in tokens if t.text[0].isupper() and not t.is_sent_start)
            n_excl         = texto.count("!")
            n_interr       = texto.count("?")
            n_comillas     = texto.count('"') + texto.count("«")
            tiene_cifras   = int(any(t.like_num for t in tokens))
            tiene_fecha    = int(any(t.ent_type_ in ("DATE", "TIME") for t in tokens))
            tiene_persona  = int(any(t.ent_type_ == "PER" for t in tokens))
            tiene_org      = int(any(t.ent_type_ == "ORG" for t in tokens))
            tiene_lugar    = int(any(t.ent_type_ == "LOC" for t in tokens))

            features.append([
                # Léxicas (ratios sobre n)
                n_adj    / n,       # 0
                n_adv    / n,       # 1
                n_stop   / n,       # 2
                n_sustant / n,      # 3
                n_verb   / n,       # 4
                n_propn  / n,       # 5
                tiene_hedge,        # 6
                tiene_factivo,      # 7
                tiene_eval,         # 8
                # Sintácticas
                n_ent,              # 9
                prof_arbol,         # 10
                n_neg,              # 11
                # Sentimiento
                score_pos,          # 12
                score_neg,          # 13
                score_neu,          # 14
                polaridad,          # 15
                # Superficie
                longitud,           # 16
                n_mayus,            # 17
                n_excl,             # 18
                n_interr,           # 19
                n_comillas,         # 20
                tiene_cifras,       # 21
                tiene_fecha,        # 22
                tiene_persona,      # 23
                tiene_org,          # 24
                tiene_lugar,        # 25
            ])

        prog = 35 + int((i + batch) / len(textos) * 25)
        actualizar_progreso(job_id, min(prog, 60), f"Features: {min(i+batch, len(textos))}/{len(textos)} oraciones...")

    return features


# Nombres de features para SHAP
FEATURE_NAMES = [
    "ratio_adjetivos", "ratio_adverbios", "ratio_stopwords",
    "ratio_sustantivos", "ratio_verbos", "ratio_propios",
    "tiene_hedge", "tiene_verbo_factivo", "tiene_verbo_evaluativo",
    "num_entidades", "prof_arbol_dep", "num_negaciones",
    "sentimiento_pos", "sentimiento_neg", "sentimiento_neu", "polaridad",
    "longitud_tokens", "mayusculas_internas", "exclamaciones",
    "interrogaciones", "comillas", "tiene_cifras",
    "tiene_fecha", "tiene_persona", "tiene_organizacion", "tiene_lugar",
]


# ══════════════════════════════════════════════════════════════
# ENTRENAMIENTO
# ══════════════════════════════════════════════════════════════

def entrenar(job_id: int, X: list, y: list, oracion_ids: list) -> dict:
    """
    Entrena XGBoost con 5-fold cross-validation.
    Calcula F1/Precisión/Recall por categoría y análisis SHAP.
    """
    import numpy as np
    import xgboost as xgb
    import shap
    from sklearn.preprocessing import LabelEncoder
    from sklearn.model_selection import StratifiedKFold, cross_validate
    from sklearn.metrics import (
        f1_score, precision_score, recall_score,
        confusion_matrix, classification_report,
    )

    actualizar_progreso(job_id, 62, "Preparando datos para XGBoost...")

    X_arr = np.array(X, dtype=float)
    le    = LabelEncoder()
    y_enc = le.fit_transform(y)  # A=0, B=1, C=2

    # ── Modelo XGBoost ───────────────────────────────────────
    modelo = xgb.XGBClassifier(
        n_estimators     = 200,
        max_depth        = 5,
        learning_rate    = 0.1,
        subsample        = 0.8,
        colsample_bytree = 0.8,
        use_label_encoder = False,
        eval_metric      = "mlogloss",
        random_state     = 42,
        n_jobs           = -1,
    )

    # ── 5-fold Cross-Validation ──────────────────────────────
    actualizar_progreso(job_id, 68, "Ejecutando 5-fold cross-validation...")

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_results = cross_validate(
        modelo, X_arr, y_enc, cv=cv,
        scoring=["f1_macro", "f1_weighted"],
        return_train_score=False,
    )

    # ── Entrenamiento final con todos los datos ───────────────
    actualizar_progreso(job_id, 75, "Entrenando modelo final...")
    modelo.fit(X_arr, y_enc)

    y_pred = modelo.predict(X_arr)

    # ── Métricas por categoría ───────────────────────────────
    cats   = le.classes_   # ['A', 'B', 'C']
    f1_pc  = f1_score(y_enc, y_pred, average=None)
    pr_pc  = precision_score(y_enc, y_pred, average=None, zero_division=0)
    rc_pc  = recall_score(y_enc, y_pred, average=None, zero_division=0)
    f1_mac = f1_score(y_enc, y_pred, average="macro")

    # Matriz de confusión
    cm     = confusion_matrix(y_enc, y_pred).tolist()

    # ── SHAP ─────────────────────────────────────────────────
    actualizar_progreso(job_id, 82, "Calculando análisis SHAP...")

    explainer   = shap.TreeExplainer(modelo)
    shap_values = explainer.shap_values(X_arr)

    # Top 10 features por categoría
    shap_features = {}
    for ci, cat in enumerate(cats):
        sv   = np.abs(shap_values[ci]).mean(axis=0)
        top  = sorted(zip(FEATURE_NAMES, sv.tolist()), key=lambda x: -x[1])[:10]
        shap_features[cat] = [{"feature": f, "importancia": round(v, 4)} for f, v in top]

    return {
        "total_oraciones": len(y),
        "f1_global":       round(float(f1_mac), 3),
        "f1":              {c: round(float(v), 3) for c, v in zip(cats, f1_pc)},
        "precision":       {c: round(float(v), 3) for c, v in zip(cats, pr_pc)},
        "recall":          {c: round(float(v), 3) for c, v in zip(cats, rc_pc)},
        "cv_f1_macro_mean": round(float(cv_results["test_f1_macro"].mean()), 3),
        "cv_f1_macro_std":  round(float(cv_results["test_f1_macro"].std()), 3),
        "confusion_matrix": {
            "labels": cats.tolist(),
            "matrix": cm,
        },
        "shap_features": shap_features,
        "modelo":        modelo,
        "label_encoder": le,
    }


# ══════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--job_id",        type=int, required=True)
    parser.add_argument("--min_oraciones", type=int, default=300)
    args = parser.parse_args()

    job_id = args.job_id
    log.info(f"[Classifier] Iniciando job #{job_id}")

    try:
        # 1. Cargar dataset
        actualizar_progreso(job_id, 10, "Cargando dataset anotado...")
        textos, categorias, ids = cargar_dataset(args.min_oraciones)

        # 2. Extraer features
        actualizar_progreso(job_id, 20, "Iniciando extracción de features lingüísticas...")
        X = extraer_features(textos, job_id)

        # 3. Entrenar
        actualizar_progreso(job_id, 60, "Iniciando entrenamiento XGBoost...")
        resultados = entrenar(job_id, X, categorias, ids)

        # 4. Guardar modelo
        actualizar_progreso(job_id, 92, "Guardando modelo en disco...")
        modelo_path = str(MODELS_DIR / f"modelo_{job_id}.pkl")
        with open(modelo_path, "wb") as f:
            pickle.dump({
                "modelo":        resultados.pop("modelo"),
                "label_encoder": resultados.pop("label_encoder"),
                "feature_names": FEATURE_NAMES,
                "job_id":        job_id,
                "entrenado_en":  datetime.now().isoformat(),
            }, f)

        # 5. Guardar resultados en BD
        actualizar_progreso(job_id, 97, "Guardando resultados en base de datos...")
        guardar_resultados(job_id, resultados, modelo_path)

        log.info(f"[Classifier] Job #{job_id} completado.")
        log.info(f"  F1 global : {resultados['f1_global']}")
        log.info(f"  F1 por cat: A={resultados['f1']['A']} B={resultados['f1']['B']} C={resultados['f1']['C']}")
        log.info(f"  Modelo    : {modelo_path}")

    except ValueError as e:
        marcar_error(job_id, str(e))
        sys.exit(1)
    except Exception as e:
        import traceback
        marcar_error(job_id, traceback.format_exc())
        sys.exit(1)


if __name__ == "__main__":
    main()
