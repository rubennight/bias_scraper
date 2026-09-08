# Bitácora de desarrollo — bias_scraper

## Entrada 2026-09-07 — Persistencia de candidatos entre corridas para evitar pérdida de cobertura multi-fuente

**Fase KDD afectada:** Fase 1 — Selección, y Fase 3 — Transformación (detección de eventos por clustering)
**Módulos involucrados:** `scraper/db.py`, `scraper/clustering.py`, `scraper/pipeline.py`
**Severidad:** Alta — la mayoría de las corridas del pipeline guardaban 0 artículos nuevos pese a scrapear decenas de notas relevantes con éxito.

---

### 1. Contexto

Al revisar por qué el corpus crecía muy poco corrida tras corrida, se ejecutó el pipeline en vivo dentro del contenedor `bias-scraper-pipeline` y se instrumentó el conteo en cada etapa. Corrida de referencia (2026-09-07 08:15, ventana ISO 2026-W36):

| Etapa | Artículos |
|---|---|
| RSS recolectados (19 fuentes) | 365 |
| Pasan filtro temático (título) | 86 |
| Logran extraer cuerpo + keywords | 54 |
| Quedan conectados a algún otro artículo | 19 |
| Forman cluster de ≥2 artículos | 8 clusters |
| Eventos válidos (≥3 fuentes distintas) | 3 eventos / 9 artículos |
| **Guardados nuevos en BD** | **0** (los 9 ya existían de corridas previas) |

De 365 notas descargadas, 0 terminaron siendo artículos nuevos guardados. Revisando otras corridas del mismo día se repite el patrón: `[Filtrado] 0 eventos válidos (≥3 fuentes)` es el resultado más común pese a haber decenas de candidatos con keywords ya extraídas.

### 2. Causa raíz

`clustering.py` scrapea el cuerpo completo y extrae keywords de cada candidato (`extraer_keywords_todos()`) — el paso más caro del pipeline, ~3-4s por artículo — y luego construye el grafo de co-ocurrencia (`construir_grafo_eventos()`) **únicamente con los artículos de esa misma corrida**. Un artículo se guarda en `articulos` solo si termina dentro de un cluster con `MIN_FUENTES_POR_EVENTO = 3` fuentes distintas.

Si al momento de una corrida solo 1 o 2 medios habían publicado sobre un hecho, ese artículo no cumple el umbral **y se descarta por completo** — el trabajo de scraping ya hecho (cuerpo + keywords) se tira. La siguiente corrida, horas después, cuando el tercer medio ya publicó, vuelve a bajar el RSS desde cero: si el artículo del primer medio sigue en el feed (los feeds solo retienen ~20-30 ítems recientes) se vuelve a scrapear y re-procesar; si ya rotó fuera del feed, se pierde para siempre y ese evento nunca alcanza cobertura de 3 fuentes.

En síntesis: la ventana de oportunidad para que un evento junte sus 3 fuentes no era "toda la semana ISO" (como sugiere el diseño de `ventana_inicio`/`ventana_fin`), sino **la duración de una sola ejecución del pipeline** — unos 20-30 minutos. Esto no es un fallo de scraping ni de los umbrales de clustering (`MIN_FUENTES_POR_EVENTO`, `MIN_KEYWORDS_COMPARTIDAS`); es una pérdida de estado entre corridas.

### 3. Por qué no se tocaron los umbrales de clustering

Antes de este cambio ya se había intentado (y revertido, ver commit `ab67903`/`0991b02`) exigir un peso IDF además del conteo de keywords compartidas, endureciendo el criterio — resultado: 0 eventos válidos con un pool real de 119 artículos. Relajar `MIN_FUENTES_POR_EVENTO` o `MIN_KEYWORDS_COMPARTIDAS` en la dirección contraria habría "arreglado" el síntoma (más eventos guardados) a costa de debilitar la definición metodológica de "evento" que sostiene la comparación de sesgo entre medios — el punto central de la tesis es medir cómo distintos medios cubren el **mismo** hecho, y eso exige que el criterio de agrupación siga siendo estricto. Por eso la solución ataca la pérdida de estado, no el umbral.

### 4. Solución implementada

**a) Tabla nueva `articulos_candidatos` (`scraper/db.py`)** — almacena artículos que ya pasaron scraping (tienen `cuerpo` + `keywords`) pero no lograron evento válido en la corrida donde se descubrieron: `url`, `fuente_nombre`, `titular`, `cuerpo`, `autor`, `fecha_pub`, `metodo`, `keywords` (`TEXT[]`), `ventana_inicio`/`ventana_fin` (para acotar por semana ISO) y `veces_visto` (cuántas corridas lo han vuelto a encontrar, útil para observabilidad). `crear_tablas()` es idempotente — no requiere migración manual.

Cuatro funciones nuevas en `db.py`:
- `guardar_candidatos(candidatos, ventana_inicio, ventana_fin)` — upsert; si ya existía solo incrementa `veces_visto`.
- `obtener_candidatos(ventana_inicio, ventana_fin)` — trae los pendientes de la ventana ISO activa, ya con keywords, sin necesidad de re-scrapear.
- `eliminar_candidatos(urls)` — retira de pendientes los que se promovieron a artículo guardado.
- `limpiar_candidatos_vencidos(ventana_inicio_actual)` — purga candidatos de ventanas ISO ya cerradas (si no lograron evento en toda su semana, no hay motivo para seguir esperando).

**b) `clustering.py` — `detectar_eventos()` acepta `candidatos_previos`** y cambia su contrato de retorno de `list` a `tuple(eventos_validos, articulos_huerfanos)`. Antes de scrapear, se excluyen del pool "nuevo" las URLs que ya llegan con keywords desde `candidatos_previos` (no se re-scrapean). El grafo de co-ocurrencia y el BFS de componentes conectadas se construyen sobre la **unión** de candidatos nuevos + pendientes — así un artículo de la corrida de la mañana puede conectar con uno de la tarde sin depender de que ambos coexistan en la misma ejecución. Los umbrales de clustering (`MIN_FUENTES_POR_EVENTO`, `MIN_KEYWORDS_COMPARTIDAS`) no se modificaron.

**c) `pipeline.py` — orquestación:** al inicio del paso 2 se purgan candidatos vencidos y se cargan los pendientes de la ventana activa; al final del paso 3, los artículos que sí se guardaron en algún evento (`urls_promovidas`) se retiran de la tabla de candidatos, y los que quedaron sin evento (`huerfanos`, que ahora puede incluir tanto artículos nuevos como candidatos que siguen esperando) se vuelven a guardar como pendientes para la próxima corrida. El resumen final del log ahora reporta también `Candidatos pendientes`.

### 5. Qué NO cambió

- Los umbrales `MIN_FUENTES_POR_EVENTO = 3` y `MIN_KEYWORDS_COMPARTIDAS = 4`.
- El esquema de `articulos`/`eventos` y la lógica de reuso de eventos por URL compartida (`obtener_evento_id_por_urls`).
- La lista de fuentes/RSS en `config.py` — en particular no se quitó Animal Político (`politica.expansion.mx`) pese a su tasa de fallo de scraping cercana al 100% observada en los logs, porque no es necesario para este cambio y quitarla es una decisión aparte, pendiente de investigar si es bloqueo anti-bot o un problema de markup.

### 6. Validación

Se corrió el pipeline en vivo dentro del contenedor `bias-scraper-pipeline` (ventana ISO 2026-W36, ya cerrada — el pipeline analiza la semana anterior completa):

**Corrida 1 (2026-09-07 21:51):** 0 eventos válidos, pero **6 artículos huérfanos guardados** en `articulos_candidatos` (antes de este cambio se habrían descartado sin dejar rastro).

**Corrida 2, disparada por el sistema ~30 min después (2026-09-07 22:24), sin intervención manual:**
```
[Pipeline] 6 candidatos pendientes de corridas anteriores
[Selección] 53 artículos en semana ISO 2026-W36
[Filtrado temático] 14 relevantes · 39 descartados
[Transformación] Extrayendo keywords de 8 artículos...
```
14 artículos pasaron el filtro temático, pero solo **8** se mandaron a scrapear — los 6 restantes eran justo los candidatos ya guardados con keywords cacheadas de la corrida anterior, confirmando que **no se volvieron a descargar ni re-procesar**. Esto valida el objetivo central del cambio: el trabajo de scraping ya hecho deja de perderse entre corridas.

**Nota operativa detectada durante la prueba (no relacionada con este cambio):** existe un disparador externo que ejecuta el pipeline periódicamente sin intervención manual (se observaron corridas no lanzadas por el desarrollador). Como el `articulos_candidatos.url` tiene UNIQUE constraint y `guardar_candidatos` usa `ON CONFLICT DO UPDATE`, dos corridas solapadas siguen siendo seguras a nivel de datos (sin duplicados ni corrupción) — en el peor caso `veces_visto` se incrementa de más si dos corridas se solapan en el tiempo exacto de guardado. No se observó ningún error ni artículo perdido por esta concurrencia.

**Corrida 3 (2026-09-07 22:24-22:29, la misma disparada por el sistema):** de los 8 artículos nuevos enviados a scraping, ninguno logró extraer keywords exitosamente (fuentes flakeantes: El Financiero timeout en Playwright, Animal Político sin keywords). Resultado: `articulos_candidatos` se mantuvo estable en **6 filas** (mismas de la corrida 1), con `veces_visto` incrementado limpiamente de 2 a 3 — sin duplicados, sin pérdida. Confirma que el mecanismo es estable ante corridas sucesivas que no aportan candidatos nuevos.

### 7. Adenda 2026-09-08 — Revertir "semana anterior", volver a "semana actual"

Después de este cambio se investigó por qué el pipeline procesaba muchos menos artículos que antes (hasta 100 por corrida vs. unas pocas decenas). Causa: el commit `be4b08c` (2026-09-06) había cambiado la ventana de análisis de la semana **actual** a la semana **anterior ya cerrada**, buscando resultados deterministas sin importar qué día se ejecutara el pipeline.

Ese cambio no contaba con que los feeds RSS de los medios retienen muy pocas horas de contenido — medido en vivo el 2026-09-07: Reforma ~15h (10 items), El Universal ~8h (100 items publicados muy rápido), El Financiero ~30h, Animal Político ~3.5 días. Muy por debajo de los hasta 13 días de antigüedad que puede tener "la semana anterior" según qué día del ciclo corra el pipeline. Para cuando el pipeline pedía esa ventana, la mayoría de los feeds ya habían rotado ese contenido — no es que el scraping fallara, el artículo ya no estaba en el RSS. Se confirmó con dos corridas el mismo día sobre la misma ventana ISO: 365 candidatos a las 08:15 → 53 candidatos a las 22:24.

El problema que motivó el cambio a "semana anterior" (correr a mitad de semana da resultados parciales) ya lo resuelve mejor la persistencia de `articulos_candidatos` de este mismo cambio: los artículos sin evento válido ya no se pierden entre corridas, así que la cobertura de una semana se sigue acumulando corrida a corrida sin necesidad de esperar a que cierre. Se revirtió `pipeline.py` a `get_semana_iso(date.today())` (semana en curso).

**Archivo modificado:** `scraper/pipeline.py`

### 8. Trabajo futuro / pendiente

- Investigar por qué `politica.expansion.mx` (Animal Político) falla sistemáticamente tanto con Newspaper3k como con el fallback de Playwright.
- Paralelizar `extraer_keywords_todos()` (hoy secuencial con `time.sleep(DELAY_SCRAPER)` entre cada artículo) — cada corrida tarda 15-20 minutos casi todo en I/O de red serializado.
- Considerar una alerta u observación periódica sobre `veces_visto` alto en `articulos_candidatos` — un candidato que lleva muchas corridas sin conseguir su tercera fuente puede indicar un tema genuinamente cubierto por 1-2 medios (no es un "evento" bajo la definición del corpus) más que un problema técnico.

---

**Archivos modificados:** `scraper/db.py`, `scraper/clustering.py`, `scraper/pipeline.py`
**Tabla nueva:** `articulos_candidatos`
