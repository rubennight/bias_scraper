# Bitácora de desarrollo — bias_scraper

## Entrada 2026-10-30 — Registro de anotadores con aprobación, cola aleatoria con bloque compartido y guía de anotación

**Fase KDD afectada:** Fase 4 — Anotación (y la validez del Kappa que habilita la Fase 5)
**Módulos involucrados:** `sql/registro_anotadores.sql`, `api/routes/auth.js`, `api/routes/admin.js`, `api/routes/anotacion.js`, `api/middleware/auth.js`, `api/lib/{registro,cola,validar-anotacion}.js`, `web/src/pages/{Registro,Solicitudes,Anotacion,Login}.jsx`, `web/src/components/ResumenEvento.jsx`, `web/src/anotacion/*`, `web/src/App.jsx`
**Severidad:** Media — es una ampliación, pero cierra dos huecos reales: cualquiera podía anotar a nombre de otro y el Banco permitía ver cómo clasificó otra persona antes de anotar.

Diseño: `docs/superpowers/specs/2026-10-30-registro-anotadores-design.md`. Plan: `docs/superpowers/plans/2026-10-30-registro-anotadores.md`.

---

### 1. Contexto

La Fase 4 dependía de un solo anotador (169 anotaciones, todas de Rubén). Para llegar a más anotadores y calcular el Kappa entre ellos (umbral κ ≥ 0.6, Landis & Koch, 1977) hacía falta: (a) que otras personas pudieran registrarse sin que cualquiera entrara, (b) que cada quien anotara con su propio perfil, y (c) que existiera un conjunto de oraciones anotado por más de una persona.

Además se encontraron dos fallas del modelo anterior de "confianza en el cliente": los endpoints de anotación aceptaban el `anotador_id` que mandaba el navegador, y el Banco de Anotaciones mostraba las clasificaciones de todos.

### 2. Qué se hizo

**Registro con aprobación.** Formulario público con nombre completo, email, celular y contraseña. La cuenta nace `pendiente` y no puede iniciar sesión hasta que el admin la apruebe (pantalla `/solicitudes`, solo admin, con contador de pendientes). Al aprobar se crea un perfil de anotador nuevo o se vincula uno existente. El email, en minúsculas, es el usuario de login. Datos validados y normalizados en el servidor (nombre ≥ 3 caracteres, celular de 10 dígitos, contraseña ≥ 8 caracteres, bcrypt costo 12). El registro responde siempre igual exista o no el correo, y el login solo revela "pendiente" o "rechazada" después de validar la contraseña, para no poder averiguar qué cuentas existen. Límite de 5 registros por hora por IP.

**Identidad desde la sesión.** `requireAnotador` obtiene el perfil de la BD y el servidor ignora cualquier `anotador_id` del cliente en oraciones, estadísticas, anotar y borrar. Se omitió la pantalla "¿Quién anota?" (el componente se conserva sin uso). Crear anotadores a mano pasa a ser solo admin.

**Cola aleatoria con bloque compartido.** Las primeras 100 oraciones que recibe cada anotador son las mismas para todos (tabla `bloque_compartido`, congelada); después cada uno recibe oraciones al azar con un orden propio y estable (`MD5(oración + anotador)`), prefiriendo las que nadie más ha anotado. El bloque son las 100 oraciones de menor `MD5('bloque' || id)` entre las elegibles con artículo, fuente y evento.

**Aislamiento del Banco.** Un anotador que no es admin no ve las anotaciones de otros sobre oraciones del bloque. Las propias y el resto del corpus siguen visibles; el admin ve todo.

**Resumen del evento.** Bloque plegable, abierto por defecto, arriba de la oración, para no perder el contexto de la nota.

**Reglas y guía.** Obligatorio: categoría dominante; en B y C al menos un elemento de tipo B o C con su alternativa neutral; subtipo en todo elemento escrito. Opcional: elementos en A, confianza (por defecto "alta") y notas (recomendadas). Se validan en el formulario y en el servidor. El panel de ejemplos suma las pestañas "Mixtas" (9 oraciones con elementos de varios tipos y el porqué de la dominante) y "Guía" (pasos, tabla de obligatorio/opcional y casos límite), y las instrucciones iniciales traen la tabla de obligatorio/opcional.

**Datos.** Se enlazó la cuenta `ru` con el perfil de Rubén Jiménez Navarro y se borró el perfil de anotador de María Cristina Justo Hernández (id 2), que no tenía anotaciones ni cuenta. El borrado está protegido para no ejecutarse si en el entorno ya tiene datos.

### 3. Por qué un bloque compartido y no el mismo orden para todos

El Kappa solo necesita que al menos dos personas anoten las mismas oraciones; no hace falta que todos anoten todo. Con el mismo orden para todos, cada oración se anotaría tantas veces como anotadores haya y el corpus útil crecería a una fracción de la velocidad, justo cuando la clase B es la más escasa (14 de 169 anotaciones). Con 100 oraciones compartidas la estimación del Kappa es más estable que con 50 (el mínimo defendible), y el 90% del trabajo posterior se reparte sin repeticiones. La independencia del Kappa se protege porque nadie ve la clasificación de otro (aislamiento del Banco) ni ninguna etiqueta sugerida por un agente.

### 4. Decisiones y cosas que conviene saber

- **El bloque excluye oraciones de artículos sin evento.** La primera versión de la migración elegía 4 oraciones que la cola nunca entregaba (la consulta une con `eventos`), así que el bloque quedaba en 96. Se corrigió la elección y se reconstruyó la tabla local.
- **`progresoBloque.total` descuenta las oraciones del bloque marcadas `compleja` o `descartada`:** si no, sería imposible llegar a "100 de 100".
- **`crear-admin.js` ahora crea cuentas `aprobado`:** el default de la columna es `pendiente`.
- **Datos personales.** Se guardan email y celular de los anotadores solo para gestionar cuentas, y nunca se exponen a otros anotadores. Por decisión del autor no se requiere un aviso de privacidad específico en la tesis; como agradecimiento se podrán mencionar los nombres de los anotadores cuando existan.
- **Sin recuperación de contraseña, sin verificación de email ni aviso al admin por correo.** Un admin puede restablecer una contraseña con `api/scripts/crear-admin.js`.
- **La dominante se elige viendo la oración completa, no contando elementos** (decisión del autor, ya presente en la taxonomía).

### 5. Revisión independiente y correcciones

Una revisión de toda la rama por un revisor independiente no encontró problemas críticos y señaló seis importantes, que se corrigieron en una sola pasada con prueba primero:

- **Fuga por `/lexicon` y `/kappa`:** devolvían a cualquier anotador los elementos de todos y permitían averiguar cómo había clasificado otro el bloque compartido. Ahora son solo para admin (los consume Clasificador, que ya lo era).
- **Marcas `compleja` y `descartada`:** cualquier anotador podía quitarlas de cualquier oración, es decir, alterar el bloque compartido para todos. Ahora un anotador solo puede marcar; quitar la marca es del admin.
- **Límites de intentos:** los errores de validación del registro y los inicios de sesión correctos ya no gastan el cupo por IP (detrás de un proxy todos comparten IP y un error de dedo bloqueaba a todo el equipo). El límite de intentos fallidos de login se mantiene (se comprobó: 5 fallos y el sexto da 429).
- **Correo bloqueado tras un rechazo:** una solicitud rechazada ahora se puede volver a registrar (queda pendiente con los datos nuevos), así el dueño real de un correo que alguien más usó no queda bloqueado. Las pendientes y las aprobadas nunca se sobrescriben.
- **Orden de despliegue:** la migración debe aplicarse **antes** de desplegar la API nueva (ver el encabezado de `sql/registro_anotadores.sql`).
- **Pruebas de seguridad que solo se habían comprobado a mano:** decisión del login según estado y contraseña (`lib/login.js`), 403 sin perfil de anotador, correo duplicado, aislamiento del Banco (`lib/banco.js`), permisos de las rutas y límite del registro.

### 6. Verificación

Pruebas automatizadas: 50 en la API (validación de registro, de anotaciones, de la cola, de solicitudes, del aislamiento del Banco, del login, de permisos y del límite de registro, las de BD con transacciones revertidas) y 23 en el frontend (validadores y datos de la guía). Con `curl` contra la API local: registro, cuenta pendiente, aprobación, rechazo, 403 a un anotador en rutas de admin, anotador de la sesión por encima del enviado por el cliente, borrado de anotaciones ajenas, aislamiento del Banco y validación de `/anotar`. Lint limpio en los archivos de la rama. **Pendiente de revisión visual por el autor:** las pantallas no se vieron en un navegador durante la implementación.

### 7. Pendientes

- Aplicar `sql/registro_anotadores.sql` a mano en producción **antes** de desplegar la API (no se ejecuta automático desde ningún lado).
- **Verificar `trust proxy` y la IP real del cliente detrás de Cloudflare Tunnel antes de invitar anotadores.** Los límites de intentos (login y registro) se calculan por IP; si el proxy no preserva la IP real, todos comparten un solo cupo. No se tocó en esta rama porque no se puede comprobar fuera de producción.
- Menores diferidos de la revisión: `progresoBloque` cuenta `hechas` sin el filtro de elegibles; la FK de `bloque_compartido` no tiene `ON DELETE CASCADE`; el `UPDATE` que enlaza a `ru` no verifica el nombre del perfil; `usuarios.anotador_id` sin índice único (dos aprobaciones simultáneas podrían ligar dos cuentas al mismo perfil); el validador de anotaciones del frontend y el del backend son copias que podrían divergir y el servidor guarda `tipo` por omisión como la categoría; falta validar entradas mal formadas en `/anotar`, `/registro` y `/aprobar` (responden 500 en vez de 400) y poner tope de longitud a nombre y contraseña; `pool.connect()` de `admin.js` fuera del `try`; `crear-admin.js` aprobaría a un solicitante pendiente si se usa para restablecer su contraseña; las rutas de aprobar y rechazar aceptan POST vacío y dependen de `SameSite=Lax`; `cola.test.js` depende de datos de la BD local.
- Revisar visualmente `/registro`, `/solicitudes`, el panel de ejemplos (Mixtas y Guía) y el resumen del evento.
- Cuando dos anotadores terminen el bloque, calcular el Kappa con `GET /api/anotacion/kappa`.
- Deuda de lint previa en archivos que esta entrada no toca (`Scraper.jsx`, la búsqueda de `Eventos`, entre otros).
