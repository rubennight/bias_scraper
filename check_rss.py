# Script temporal para verificar qué RSS feeds responden correctamente
# Uso: python check_rss.py
from scraper import RSS_FEEDS, parsear_rss

for medio, feeds in RSS_FEEDS.items():
    print(f"\n{'─'*50}")
    print(f"[{medio}]")
    for url in feeds:
        items = parsear_rss(url)
        if items:
            print(f"  ✓ {url}")
            print(f"    {len(items)} artículos — ejemplo: {items[0]['titular'][:60]}")
        else:
            print(f"  ✗ {url}")
