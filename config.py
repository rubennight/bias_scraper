# =============================================================
# config.py — Configuración central del proyecto
# Aquí defines los medios, parámetros y filtros.
# No contiene lógica — solo valores que los demás archivos usan.
# =============================================================

# Medios mexicanos a scrapear con su orientación ideológica
FUENTES = [
    # Izquierda
    {"nombre": "La Jornada",        "url_base": "https://www.jornada.com.mx",           "orientacion": "izquierda"},
    {"nombre": "El Informador",     "url_base": "https://www.informador.mx",             "orientacion": "izquierda"},
    # Crítico / independiente
    {"nombre": "Aristegui Noticias","url_base": "https://aristeguinoticias.com",         "orientacion": "critico"},
    {"nombre": "El Financiero",     "url_base": "https://www.elfinanciero.com.mx",       "orientacion": "critico"},
    # Centro
    {"nombre": "Animal Político",   "url_base": "https://politica.expansion.mx",        "orientacion": "centro"},
    {"nombre": "El Universal",      "url_base": "https://www.eluniversal.com.mx",        "orientacion": "centro"},
    # Derecha
    {"nombre": "24 Horas",          "url_base": "https://www.24-horas.mx",              "orientacion": "derecha"},
    {"nombre": "El Norte",          "url_base": "https://www.elnorte.com",              "orientacion": "derecha"},
]

# =============================================================
# LISTA BLANCA — Solo pasan trends que coincidan con al menos
# una keyword de alguna de estas categorías.
# Todo lo demás (deportes, entretenimiento, clima) se descarta.
# =============================================================
CATEGORIAS_RELEVANTES = {
    "politica": [
        "presidente", "gobierno", "congreso", "senado", "diputados",
        "secretaria", "secretario", "partido", "elecciones", "reforma",
        "sheinbaum", "morena", "pan", "pri", "prd", "mc", "oposicion",
        "gabinete", "gobernador", "alcalde", "municipio", "legislativo",
        "mañanera", "conferencia", "decreto", "politica", "ministra",
        "ministro", "claudia", "xochitl", "noroña", "monreal",
    ],
    "seguridad": [
        "crimen", "violencia", "homicidio", "feminicidio", "cartel",
        "ejercito", "guardia nacional", "fiscalia", "detenido", "capturado",
        "narco", "desaparecidos", "masacre", "balacera", "extorsion",
        "secuestro", "policia", "delito", "robo", "ataque",
    ],
    "economia": [
        "peso", "dolar", "inflacion", "pib", "banxico", "pemex",
        "cfe", "presupuesto", "deuda", "inversion", "empresa", "empleo",
        "desempleo", "salario", "pobreza", "crecimiento", "recesion",
        "mercado", "bolsa", "tipo de cambio", "aranceles", "exportacion",
    ],
    "geopolitica": [
        "estados unidos", "trump", "aranceles", "migracion", "frontera",
        "china", "rusia", "onu", "tratado", "relaciones exteriores",
        "embajada", "diplomatico", "guerra", "conflicto", "sancion",
        "nearshoring", "t-mec", "deportacion", "asilo",
    ],
    "justicia": [
        "juicio", "sentencia", "tribunal", "suprema corte", "juez",
        "amparo", "derechos humanos", "presos", "corrupcion", "impunidad",
        "fiscal", "ministerio publico", "detencion", "acusado", "demanda",
        "fallo", "resolucion", "poder judicial",
    ],
}

# Cuántos días hacia atrás buscar artículos
DIAS_ANTIGUEDAD = 3

# Cuántos trends relevantes tomar como máximo (resultado final)
MAX_TRENDS = 15

# Cuántos candidatos revisar de Google Trends antes de filtrar
# Google Trends México suele tener 20-50 trends por día
MAX_CANDIDATOS = 50

# Segundos de espera entre requests del scraper
DELAY_SCRAPER = 3
