# =============================================================
# config.py — Configuración central del proyecto
# Metodología: KDD (Knowledge Discovery in Databases)
# Fuente de datos: RSS por secciones temáticas
# =============================================================

# Medios mexicanos con su orientación ideológica
FUENTES = [
    # Izquierda
    {"nombre": "La Jornada",        "url_base": "https://www.jornada.com.mx",        "orientacion": "izquierda"},
    {"nombre": "El Informador",     "url_base": "https://www.informador.mx",          "orientacion": "izquierda"},
    # Crítico / independiente
    {"nombre": "Aristegui Noticias","url_base": "https://aristeguinoticias.com",      "orientacion": "critico"},
    {"nombre": "El Financiero",     "url_base": "https://www.elfinanciero.com.mx",    "orientacion": "critico"},
    # Centro
    {"nombre": "Animal Político",   "url_base": "https://politica.expansion.mx",     "orientacion": "centro"},
    {"nombre": "El Universal",      "url_base": "https://www.eluniversal.com.mx",     "orientacion": "centro"},
    # Derecha
    {"nombre": "24 Horas",          "url_base": "https://www.24-horas.mx",           "orientacion": "derecha"},
    {"nombre": "El Norte",          "url_base": "https://www.elnorte.com",           "orientacion": "derecha"},
]

# =============================================================
# RSS POR SECCIONES TEMÁTICAS
# =============================================================
RSS_FEEDS = {
    "La Jornada": [
        "https://www.jornada.com.mx/rss/politica.xml",
        "https://www.jornada.com.mx/rss/economia.xml",
        "https://www.jornada.com.mx/rss/mundo.xml",
        "https://www.jornada.com.mx/rss/sociedad.xml",
    ],
    "El Informador": [
        "https://informador.mx/rss/mexico.xml",
    ],
    "Aristegui Noticias": [
        "https://editorial.aristeguinoticias.com/feed/",
        "https://editorial.aristeguinoticias.com/category/mexico/feed/",
    ],
    "El Financiero": [
        "https://www.elfinanciero.com.mx/arc/outboundfeeds/rss/?outputType=xml",
    ],
    "Animal Político": [
        "https://politica.expansion.mx/rss",
    ],
    "El Universal": [
        "https://www.eluniversal.com.mx/arc/outboundfeeds/rss/?outputType=xml",
    ],
    "24 Horas": [
        "https://www.24-horas.mx/feed",
    ],
    "El Norte": [
        "https://www.elnorte.com/rss/portada.xml",
    ],
}

# =============================================================
# FILTRADO TEMÁTICO
# =============================================================
PALABRAS_RELEVANTES = [
    # Política
    "sheinbaum", "gobierno", "presidente", "presidenta", "congreso",
    "senado", "diputados", "secretar", "partido", "elección", "reforma",
    "morena", "gobernador", "alcalde", "legislat", "decreto", "mañanera",
    "gabinete", "ministro", "ministra", "tribunal", "corte", "juez",
    "rocha", "sinaloa", "cartel", "fiscalía", "fgr",
    # Seguridad
    "violencia", "homicidio", "feminicidio", "crimen", "narco",
    "desaparec", "masacre", "ejército", "guardia nacional", "detenid",
    "capturad", "ataque", "balacera", "secuestro", "extorsión",
    # Economía
    "inflación", "peso", "dólar", "banxico", "pemex", "cfe",
    "presupuesto", "deuda", "salario", "empleo", "desempleo",
    "aranceles", "exportación", "inversión", "pib", "mercado",
    # Geopolítica
    "trump", "estados unidos", "migraci", "deportaci", "frontera",
    "china", "rusia", "guerra", "sanción", "diplomát", "embajad",
    "t-mec", "relaciones exteriores",
    # Justicia
    "sentencia", "amparo", "derechos humanos", "presos", "corrupción",
    "impunidad", "acusado", "fallo", "resolución", "poder judicial",
]

PALABRAS_EXCLUIR = [
    # Deportes
    "vs ", "en vivo", "liga mx", "fútbol", "futbol", "gol", "partido",
    "torneo", "champions", "nfl", "nba", "mlb", "f1", "gp de", "grand prix",
    "premier league", "semifinal", "cuartos de final", "portero", "delantero",
    "tigres", "chivas", "américa", "pumas", "cruz azul", "rayados",
    # Entretenimiento
    "bts", "army", "boletos", "concierto", "película", "serie", "netflix",
    "grammy", "oscar", "spotify", "artista", "cantante", "banda",
    "reality", "celebrity", "famoso",
    # Clima y lifestyle
    "granizada", "lluvia", "temperatura", "ola de calor", "clima",
    "horóscopo", "receta", "dieta", "ejercicio", "moda", "belleza",
    "plantas", "mascotas",
]

# =============================================================
# PARÁMETROS KDD
# =============================================================

# KDD Fase 1 — Selección
# HORAS_ANTIGUEDAD: usado por scraper.py para descartar artículos
# muy viejos al momento de extraer el cuerpo completo.
# Se mantiene independiente de DIAS_VENTANA.
HORAS_ANTIGUEDAD = 48

# KDD Fase 3 — Ventana temporal del clustering
# Se usan semanas ISO (lunes → domingo) calculadas desde la
# fecha_pub del artículo, NO desde la fecha de ejecución del pipeline.
# Esto evita solapamiento entre ejecuciones consecutivas — múltiples
# corridas en la misma semana ISO siempre producen la misma ventana.
# Sustento empírico: análisis del corpus mostró que el 74% de los
# artículos recuperables por RSS tienen fecha del día de ejecución,
# con un rango real de 3-4 días (Barbaresi, 2021; observación propia).
USAR_SEMANAS_ISO = True

# KDD Fase 3 — Clustering por keywords
# Mínimo de keywords compartidas entre dos artículos de fuentes
# distintas para considerarlos parte del mismo evento.
MIN_KEYWORDS_COMPARTIDAS = 4

# Mínimo de fuentes DISTINTAS para que un cluster sea evento válido
MIN_FUENTES_POR_EVENTO = 3

# Máximo de artículos a extraer por fuente dentro de un evento
MAX_ARTICULOS_POR_FUENTE = 2

# KDD Fase 4 — Minería
# Segundos de espera entre requests al scraper
DELAY_SCRAPER = 3
