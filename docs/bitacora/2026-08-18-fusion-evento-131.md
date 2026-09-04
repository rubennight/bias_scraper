# Bitácora de desarrollo — bias_scraper

## Entrada 2026-08-18 — Fusión incorrecta de eventos por encadenamiento en el clustering (Evento #131)

**Fase KDD afectada:** Fase 3 — Transformación (detección de eventos por clustering)
**Módulos involucrados:** `scraper/clustering.py`, `scraper/db.py`, `scraper/pipeline.py`
**Severidad:** Alta — un evento del corpus mezclaba dos hechos noticiosos sin relación temática, lo que habría contaminado la Fase 4 (anotación) si no se detecta antes.

---

### 1. Contexto

Durante la revisión manual del corpus generado la semana ISO 2026-W34 (17–23 de agosto) se identificó que el **Evento #131** —originalmente titulado *"PAN pide investigar a 'Andy' López Beltrán y exige que muestre el oficio de cancelación de su visa..."*— agrupaba **64 artículos de 16 fuentes distintas**, un tamaño muy superior al resto de eventos detectados esa semana.

Al revisar el listado de artículos del evento se observó que, junto con la cobertura legítima del caso de Andy López Beltrán (visa cancelada, investigación de la FGR por huachicol fiscal), aparecían mezclados artículos sobre un tema completamente distinto: la escalada de tensión entre Trump, Omán e Irán por el estrecho de Ormuz, además de notas sueltas sobre el patrimonio de funcionarios de Trump y un altercado de Trump con una reportera de CNN.

### 2. Metodología de diagnóstico

Se siguió un proceso de depuración sistemática (root-cause-first, sin aplicar correcciones antes de entender la causa):

1. **Inspección de datos** — consulta directa a PostgreSQL para listar los 64 artículos del evento 131 con su fuente y fecha de publicación, confirmando visualmente la mezcla temática.
2. **Inspección de las keywords almacenadas** (`articulo_keywords`) para varios pares de artículos representativos de cada tema.
3. **Búsqueda del artículo puente** — consulta SQL de auto-join sobre `articulo_keywords` para encontrar pares de artículos de fuentes distintas, uno del tema "Andy López" y otro del tema "Irán/Omán", que compartieran ≥ 4 keywords (el umbral `MIN_KEYWORDS_COMPARTIDAS` de `clustering.py`).
4. **Formulación de hipótesis y prueba mínima** — se escribió un script de simulación que reconstruye el grafo de co-ocurrencia y las componentes conectadas (BFS) usando los datos ya almacenados, primero replicando el comportamiento actual y después removiendo un conjunto candidato de keywords genéricas, para comparar el resultado antes/después sin tocar la base de datos.
5. **Verificación contra los logs del pipeline** (`logs/pipeline_2026081*.log`) para confirmar en qué corridas se fue formando la mezcla.

### 3. Causa raíz

En `construir_grafo_eventos()` (`scraper/clustering.py`), dos artículos de fuentes distintas se conectan en el grafo si comparten al menos `MIN_KEYWORDS_COMPARTIDAS = 4` keywords. Las keywords se extraen del cuerpo del artículo con el NLP interno de Newspaper3k, y la lista `STOPWORDS_KEYWORDS` filtraba términos genéricos como *"gobierno"*, *"nacional"*, *"presidenta"*, pero **no** nombres propios de alta frecuencia como *"trump"*, *"donald"*, *"unidos"* o *"washington"*, que aparecen en decenas de notas geopolíticas distintas dentro de una misma semana.

El artículo **id 1127** (*"Estados Unidos: Crece lista de vetados por el gobierno de Donald Trump"*, El Informador) trata tangencialmente ambos temas: menciona el caso de Andy López Beltrán como parte de una lista más amplia de personas con visa cancelada, y a la vez comparte con varios artículos de la cobertura Irán/Omán las keywords genéricas `{trump, donald, unidos, washington, presidente}`.

Como el algoritmo de agrupamiento usa **BFS sobre componentes conectadas** (equivalente a *single-linkage clustering*), basta con que **un solo artículo puente** tenga ≥ 4 keywords compartidas con dos grupos temáticos distintos para que, por transitividad, todo el grafo se colapse en una sola componente — aunque la gran mayoría de los artículos de un tema no comparten ninguna keyword directa con los del otro tema. Este es un caso concreto del problema de **encadenamiento (chaining)** conocido en clustering de enlace simple: el criterio de conexión es local (un par de nodos), pero el resultado (componente conexa) es global, así que un solo enlace débil puede fusionar dos grupos por lo demás bien separados.

### 4. Causa agravante

El pipeline se ejecutó tres veces durante esa semana ISO (17 y 18 de agosto), y `obtener_evento_id_por_urls()` (`scraper/db.py`) reutilizaba un evento existente si **al menos una URL** del nuevo cluster detectado ya pertenecía a él. Esto significa que, aunque cada corrida individual del clustering ya tenía el problema de encadenamiento descrito arriba, el mecanismo de reuso permitió que el evento fuera **creciendo progresivamente entre corridas**: de 16 → 40 → 64 artículos, arrastrando cada vez más contenido no relacionado con solo una URL de coincidencia como "evidencia".

Evidencia en los logs:

| Corrida | Log | Resultado sobre el evento #131 |
|---|---|---|
| 2026-08-17 12:20 | `pipeline_20260817_122023.log` | `[DB] Nuevo evento #131 creado.` (16 artículos) |
| 2026-08-17 22:04 | `pipeline_20260817_220414.log` | `[DB] Evento ya existe (#131) — agregando artículos nuevos.` |
| 2026-08-18 10:02 | `pipeline_20260818_100226.log` | `[DB] Evento ya existe (#131) — agregando artículos nuevos.` (incluye ya la mezcla con Irán/Ormuz/Omán) |

### 5. Solución implementada

**a) `scraper/clustering.py`** — se amplió `STOPWORDS_KEYWORDS` con los nombres genéricos de alta recurrencia (`trump`, `donald`, `unidos`, `washington`) y se corrigió un error tipográfico preexistente (`"president"` nunca hacía match con la palabra real `"presidente"`, por lo que ese filtro nunca se aplicaba).

**b) `scraper/db.py`** — `obtener_evento_id_por_urls()` ahora exige **al menos 2 coincidencias** de URL con el mismo evento (o que el cluster completo sea más chico que eso) antes de reusarlo, en vez de bastar con 1. Esto evita que un solo artículo puente arrastre un cluster completo hacia un evento existente no relacionado en corridas posteriores.

Ambos cambios son defensivos y complementarios: (a) ataca la causa raíz dentro de una sola corrida; (b) reduce el riesgo de que una fusión parcial se amplifique entre corridas sucesivas.

### 6. Validación de la hipótesis

Antes de tocar la base de datos, se simuló el reclustering del evento #131 con los datos ya almacenados, quitando del cálculo las keywords genéricas identificadas. El resultado separó limpiamente los 64 artículos en:

- **32 artículos / 15 fuentes** — caso Andy López Beltrán / huachicol fiscal
- **9 artículos / 7 fuentes** — Trump amenaza a Omán por Irán / estrecho de Ormuz
- **3 artículos / 3 fuentes** — 57 funcionarios de Trump con fortunas de 100+ mdd
- **3 artículos / 3 fuentes** — Trump declara Ormuz "nuevo territorio" de EE.UU.
- **17 artículos** sin conexión suficiente tras remover las keywords genéricas (incluye el propio artículo 1127) — no alcanzan el mínimo de `MIN_FUENTES_POR_EVENTO = 3` para constituir un evento válido.

Esto confirmó la hipótesis: las keywords genéricas eran, de hecho, el único hilo que sostenía la fusión entre temas.

### 7. Migración retroactiva de datos

Con la hipótesis validada, se aplicó la separación directamente sobre la base de datos `bias_scraper`:

- El **evento #131** se conservó con los 32 artículos del caso Andy López Beltrán (se actualizó `titular_evento` y `num_fuentes`).
- Se crearon tres eventos nuevos — **#140, #141, #142** — para los clusters de Irán/Omán/Ormuz y funcionarios de Trump.
- Los 17 artículos sin evento válido quedaron con `evento_id = NULL` (decisión tomada junto con el autor: ninguno tenía anotaciones ya guardadas, así que no hubo pérdida de trabajo de la Fase 4).
- Se eliminaron y volvieron a extraer los actores (`actores_evento`, `menciones_actor`) de los cuatro eventos resultantes, ya que los actores del evento #131 original incluían entidades de la cobertura de Irán (Teherán, Hamás, Franja de Gaza, estrecho de Ormuz, etc.) que ya no correspondían a su contenido real.

Verificación final: 32 + 9 + 3 + 3 + 17 = 64 artículos — ningún artículo se perdió en la migración. Se confirmó por consulta directa que el evento #131 ya no contiene actores relacionados con Irán, Omán, Ormuz, Hamás o Gaza.

### 8. Lecciones aprendidas

- **El clustering por enlace simple (BFS/componentes conectadas) es sensible a un solo enlace débil.** Con un dataset temáticamente diverso pero con vocabulario compartido (cobertura política de Trump, en este caso), un umbral fijo de keywords compartidas no es suficiente por sí solo — la calidad del vocabulario (qué tan específico es de un evento vs. qué tan genérico/recurrente es en el corpus) importa tanto como el umbral numérico.
- **Los mecanismos de "reuso" de estado entre ejecuciones idempotentes necesitan su propio criterio de confianza.** Reusar un evento por una sola URL coincidente parecía razonable para evitar duplicados, pero en la práctica bastaba con que un artículo ambiguo perteneciera a dos temas para que el reuso amplificara un error de una corrida anterior en la siguiente.
- **Vale la pena una revisión periódica de eventos con `num_fuentes` o número de artículos anómalamente alto** respecto a la media del corpus — fue precisamente el tamaño desproporcionado del evento #131 lo que motivó la revisión manual que encontró el problema.

### 9. Trabajo futuro / pendiente

- Considerar una alerta automática (o revisión manual periódica) cuando un evento supere un tamaño esperado (p. ej. percentil 95 de artículos por evento en el corpus), como señal temprana de una posible fusión incorrecta.
- Evaluar si el estrecho de Ormuz (eventos #140 y #142) representa en realidad una sola historia en evolución que el algoritmo separó de más por quedar justo debajo del umbral de keywords — no se forzó su fusión manual para mantener el resultado fiel al algoritmo corregido, pero es un caso límite documentable en la sección de limitaciones de la tesis.

---

**Archivos modificados:** `scraper/clustering.py`, `scraper/db.py`
**Eventos afectados en BD:** #131 (conservado, redefinido), #140, #141, #142 (nuevos)
**Artículos reclasificados:** 64 (32 retenidos en #131, 15 redistribuidos en 3 eventos nuevos, 17 desvinculados de evento)
