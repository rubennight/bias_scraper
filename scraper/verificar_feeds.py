import requests
import xml.etree.ElementTree as ET

# Medios serios mexicanos con RSS conocido — pendientes de verificar
# Excluidos: ya están en config.py, medios en inglés, sátira, inmobiliaria
candidatos = [
    # Noreste
    ("Vanguardia MX",        "noreste",    "Coahuila",   "https://vanguardia.com.mx/rss.xml"),
    ("El Siglo de Torreon",  "noreste",    "Coahuila",   "https://www.elsiglodetorreon.com.mx/index.xml"),
    # Norte
    ("El Diario Juarez",     "norte",      "Chihuahua",  "https://diario.mx/jrz/media/sitemaps/rss.xml"),
    # Occidente
    ("Mural Guadalajara",    "occidente",  "Jalisco",    "https://www.mural.com.mx/rss/portada.xml"),
    # Centro
    ("Heraldo de Mexico",    "centro",     "CDMX",       "https://heraldodemexico.com.mx/feed/"),
    ("La Razon Mexico",      "centro",     "CDMX",       "https://www.razon.com.mx/rss/feed.xml"),
    ("Capital Queretaro",    "centro",     "Queretaro",  "https://www.capitalqueretaro.com.mx/category/nacional/feed/"),
    ("SDP Noticias",         "centro",     "nacional",   "https://feeds.sdpnoticias.com/portal/all"),
    ("El Debate",            "noreste",    "Sinaloa",    "https://www.debate.com.mx/rss/feed.xml"),
    # Sureste adicional
    ("Expreso Chiapas",      "sureste",    "Chiapas",    "https://expresochiapas.com/noticias/feed/"),
    ("Novedades Campeche",   "sureste",    "Campeche",   "https://www.novedadescampeche.com.mx/feed/"),
    # Veracruz
    ("Presencia Veracruz",   "sureste",    "Veracruz",   "https://www.presencia.mx/rss/"),
]

print(f"Verificando {len(candidatos)} medios candidatos...\n")

ok, bloqueados, invalidos = [], [], []

for nombre, region, estado, url in candidatos:
    try:
        r = requests.get(url, timeout=8, headers={"User-Agent": "Mozilla/5.0"})
        if r.status_code == 200:
            try:
                root  = ET.fromstring(r.content)
                items = root.findall(".//item")
                t = items[0].find("title").text[:55] if items else "sin items"
                print(f"OK  [{region}/{estado}] {nombre}: {len(items)} arts | {t}")
                ok.append((nombre, region, estado, url, len(items)))
            except Exception:
                print(f"XML [{region}/{estado}] {nombre}: HTTP 200 pero XML invalido")
                invalidos.append(nombre)
        else:
            print(f"--- [{region}/{estado}] {nombre}: HTTP {r.status_code}")
            bloqueados.append(nombre)
    except Exception as e:
        print(f"ERR [{region}/{estado}] {nombre}: {e}")
        bloqueados.append(nombre)

print(f"\n=== RESUMEN ===")
print(f"Accesibles: {len(ok)}")
print(f"Bloqueados: {len(bloqueados)} — {bloqueados}")
print(f"XML invalido: {len(invalidos)} — {invalidos}")
