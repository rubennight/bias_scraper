# Registro y aprobación de anotadores, cola aleatoria y guía de anotación

Fecha: 2026-10-30 · Autor del diseño: Claude, con Rubén Jiménez Navarro · Estado: **decisiones pendientes resueltas (sección 7); listo para plan de implementación** (no se ha escrito código)

## 1. Intención

Abrir la Fase 4 (anotación A/B/C) a más anotadores sin perder control de calidad ni de acceso. Rubén (`ru`, admin) decide quién entra. Las oraciones se reparten al azar, con un bloque pequeño compartido para poder calcular el Kappa entre anotadores. El anotador no pierde el contexto del evento y recibe una guía clara de qué debe y qué puede hacer.

**Por qué ahora:** el corpus de anotación depende de más personas, y la metodología exige κ ≥ 0.6 entre anotadores antes de entrenar (Landis & Koch, 1977). Hoy solo Rubén ha anotado (169 anotaciones; María Cristina existe como perfil con 0), así que no hay traslape ni sesiones de Kappa.

## 2. Estado actual (verificado en el código y la BD local)

- `usuarios(id, usuario, password_hash, rol, anotador_id, creado_en)` con rol `admin` o `anotador`. Login JWT en cookie httpOnly. Solo existe `ru` (admin) y su `anotador_id` es NULL.
- `anotadores(id, nombre, descripcion)` es la identidad de anotación (FK desde `anotaciones`). Hay 2: Rubén Jiménez Navarro y María Cristina Justo Hernández.
- Scraper y Clasificador ya son solo admin, en backend (`requireRole("admin")`) y en frontend (`RouteGuard`). Anotación admite `anotador` y `admin`.
- La pantalla "¿Quién anota?" deja a cualquiera elegir cualquier perfil, y `/anotar`, `/oraciones`, `/stats` y `DELETE /:id` confían en el `anotador_id` que manda el cliente.
- `GET /api/anotacion/oraciones` ordena por `MD5(articulo_id), posicion`: aleatorio por artículo y secuencial dentro de cada uno.
- `eventos.resumen` existe y está poblado (214 de 215). El endpoint de oraciones no lo devuelve.
- El Banco de Anotaciones muestra las anotaciones de todos los anotadores.
- El Kappa por pares ya existe (`GET /kappa?anotador1_id&anotador2_id`); `sesiones_kappa` está vacía.
- Hay 20,036 oraciones elegibles (no `compleja`, no `descartada`).

## 3. Objetivos, no objetivos y antiobjetivos

**Objetivos**
1. Registro público con aprobación del admin.
2. Cada cuenta queda atada a su perfil de anotador.
3. Cola de oraciones aleatoria por anotador, con un bloque compartido de 100.
4. Resumen del evento visible mientras se anota.
5. Guía y ejemplos completos, incluidas las anotaciones mixtas con dominante.
6. Todo documentado en bitácora.

**No objetivos (por ahora)**
- Priorizar oraciones por pistas evaluativas (la "mitad dirigida"). Esta cola es la base aleatoria sobre la que se podrá agregar después.
- Aviso por correo al admin, recuperación de contraseña, verificación de email o 2FA.
- Cambios al Scraper o al Clasificador.
- Prefiltrado de ruido por heurísticas. Los anotadores siguen usando "Ruido" y "Compleja".

**Antiobjetivos (aunque "funcione" técnicamente)**
- Que un anotador vea la clasificación de otro sobre una oración del bloque compartido: contamina el Kappa.
- Que un anotador pueda anotar o borrar a nombre de otro.
- Que el anotador vea alguna etiqueta sugerida por un agente.
- Que se exponga el email o celular a otros anotadores.

## 4. Diseño por partes

### 4.1 Registro
- **Datos:** nombre completo, email, celular y contraseña.
- **BD (migración SQL aditiva e idempotente en `sql/`, aplicada a mano como la de `usuarios`):** agrega a `usuarios` las columnas `nombre_completo`, `email`, `celular`, `estado` (`pendiente | aprobado | rechazado`), `revisado_por`, `revisado_en` y `motivo_rechazo`. Las cuentas existentes quedan `aprobado`; las nuevas, `pendiente`. Índice único sobre `lower(email)`.
- **Login:** el campo `usuario` de las cuentas registradas es su email en minúsculas. El login acepta usuario o email.
- **Endpoint `POST /api/auth/registro`** (público, con límite de intentos por IP): valida nombre (≥ 3 caracteres), email, celular (10 dígitos, México, se guarda normalizado) y contraseña (≥ 8 caracteres, bcrypt costo 12 como el login actual). Responde siempre el mismo mensaje de "solicitud enviada", exista o no el correo, para no revelar cuentas.
- **Login con estado:** primero se verifica la contraseña, y solo si es correcta se informa "pendiente de aprobación" o "rechazada". Así el mensaje no sirve para enumerar cuentas.
- **Frontend:** página pública `/registro`, enlace desde Login y pantalla de confirmación.

### 4.2 Aprobación (solo admin)
- Endpoints: `GET /api/admin/solicitudes`, `POST …/:id/aprobar`, `POST …/:id/rechazar` y un contador de pendientes. Todos con `requireAuth + requireRole("admin")`.
- **Aprobar** corre en una transacción. Pone `estado='aprobado'` y `rol='anotador'`, y enlaza `anotador_id`: crea un perfil nuevo con el nombre completo, o vincula uno existente (el admin lo elige; sirve para María Cristina).
- **Rechazar** guarda el motivo opcional. No borra la fila.
- **Frontend:** página `/solicitudes` solo para admin, con un contador en la barra.
- **Migración puntual (decidido por Rubén):** enlazar `ru` con el anotador 1 (Rubén Jiménez Navarro) y **borrar el perfil de anotador de María Cristina Justo Hernández** (id 2, "Segundo Revisor"). Verificado en la BD local: no tiene anotaciones, sesiones de Kappa ni cuenta enlazada. El borrado se escribe protegido (`DELETE … WHERE id = 2 AND NOT EXISTS` en cada tabla que lo referencia), para que no borre nada si en producción ya tiene datos. Si ella quiere anotar, se registra por el flujo normal y se le crea un perfil nuevo al aprobarla.

### 4.3 Identidad y permisos de anotación
- Los endpoints de anotación **ignoran** el `anotador_id` del cliente y usan el de la sesión (`req.usuario.anotador_id`). El admin queda cubierto por su propio enlace. `DELETE /:id` y la edición del Banco comprueban que la anotación sea del propio usuario.
- Se salta la pantalla "¿Quién anota?" y se usa el perfil de la sesión. El componente `SeleccionAnotador` y `POST /anotadores` se conservan sin borrarse; el POST pasa a ser solo admin (principio aditivo).
- `GET /anotadores` no devuelve email ni celular.
- **Banco de Anotaciones:** para anotadores no-admin, no se muestran las anotaciones de otras personas sobre oraciones del bloque compartido. El admin ve todo.
- Los anotadores siguen viendo Dashboard, Eventos y Banco. Scraper y Clasificador siguen siendo solo admin.

### 4.4 Cola de oraciones
- **Bloque compartido:** 100 oraciones elegibles, fijas y congeladas en una tabla nueva `bloque_compartido(oracion_id PK, orden)`, creada una sola vez con las 100 de menor `MD5('bloque' || id)`. Se congela para que no cambie si el corpus crece con nuevos scrapes.
- **Orden de entrega por anotador:** (1) las del bloque que le faltan, en el orden fijado; (2) después, oraciones al azar. En la fase 2 se prefieren las que nadie ha anotado, y el orden es `MD5(oracion_id || anotador_id)`, estable entre sesiones y distinto por persona.
- **Granularidad:** la aleatoriedad es por oración, no por artículo. El contexto anterior y el siguiente se siguen mostrando.
- Se siguen excluyendo `compleja`, `descartada` y las ya anotadas por esa persona (versión 1).
- El anotador no ve la diferencia entre fases. La etiqueta "PRUEBA PILOTO" pasa a depender del avance en el bloque (n/100), no de las guardadas en la sesión (decisión mía).
- **Kappa:** cuando dos anotadores terminan el bloque, el admin lo calcula con el endpoint existente. El aviso de "piloto completado" aparece a las 100.

### 4.5 Resumen del evento
- `GET /oraciones` agrega `ev.resumen`. En la pantalla, un bloque plegable arriba de la oración con el titular y el resumen, abierto por defecto. La preferencia de plegado se recuerda por navegador, con `localStorage` dentro de try/catch (decisión mía).
- Si el evento no tiene resumen (hoy hay 1 de 215), se muestra "Sin resumen disponible".

### 4.6 Guía y ejemplos
- **Ejemplos mixtos:** una cuarta pestaña "Mixtas" en el panel, junto a A, B y C. Cada ejemplo muestra la oración, la lista de elementos con tipo y subtipo, la dominante elegida y **por qué**. Cubre las combinaciones A+B, A+C, B+C y A+B+C, con casos donde la dominante es cada una de ellas.
- **Regla de la dominante** (de la taxonomía): se elige mirando la oración completa, no contando elementos; un solo elemento C puede dominar una oración con tres A.
- **Casos límite** en la guía, tomados de `docs/agente_anotacion_abc.md`: cita directa de columnista, jerga institucional de seguridad, cifra sin fuente, diferencia entre Compleja y Ruido, entre otros.
- **Guía de flujo** con una tabla de qué es obligatorio, recomendado y opcional, en la pantalla de instrucciones y como pestaña "Guía" en el panel.
- **Reglas aceptadas por Rubén:**

  | Campo | Estado |
  |---|---|
  | Categoría dominante | Obligatorio |
  | Elementos en A | Opcional |
  | Elementos en B y C | Al menos uno, con su alternativa neutral |
  | Subtipo del elemento | Obligatorio si se escribe un elemento |
  | Confianza | Opcional (por defecto "alta") |
  | Notas | Opcional |
  | Compleja / Ruido | Solo cuando aplique, y excluyen la oración |

  La regla se valida en el frontend y también en el backend. Las 169 anotaciones existentes no se modifican; la validación aplica a las nuevas y a las ediciones.

### 4.7 Bitácora
- Una entrada nueva en `docs/bitacora/` del repo, y una nota en `0. Bitácora` del vault de Obsidian (que está fuera del repo y no se commitea). Debe registrar el registro con aprobación, el manejo de datos personales (email y celular), el diseño de la cola con bloque compartido y su justificación para el Kappa, la regla de aislamiento del Banco y la guía.

## 5. Restricciones

- Principio aditivo: no se elimina funcionalidad. Los componentes y endpoints reemplazados se conservan.
- Migraciones SQL idempotentes, aplicadas a mano, sin tocar datos existentes.
- Desarrollo local en Windows; `web/.env` apunta a producción, así que las pruebas locales usan `VITE_API_URL=http://localhost:3001`.
- Los datos personales (email, celular) se guardan solo para la gestión de cuentas y deben mencionarse en la tesis.

## 6. Decisiones del builder (marcadas como mías)

Email como usuario de login; respuesta genérica al registrar; contraseña mínima de 8; límite de intentos del registro; congelar el bloque en una tabla; etiqueta "piloto" por avance del bloque; Banco sin anotaciones ajenas del bloque para no-admin; vincular `ru` al anotador 1; resumen abierto y plegable; sin correo ni recuperación de contraseña.

## 7. Decisiones de Rubén (2026-10-30)

1. La tabla de obligatorio y opcional de 4.6 queda aceptada, incluido "al menos un elemento con alternativa neutral" en B y C.
2. La dominante se elige viendo la oración completa, no contando elementos. Sin criterio de desempate adicional.
3. Los datos personales no requieren un aviso de privacidad específico en la tesis. Como agradecimiento se podrán mencionar los nombres de los anotadores cuando existan.
4. Se enlaza `ru` con Rubén Jiménez Navarro y se borra el perfil de María Cristina Justo Hernández (ver 4.2).

## 8. Verificación prevista

Levantar API y frontend en local; registrar una cuenta de prueba, aprobarla y rechazarla; comprobar que una cuenta pendiente no entra; que un anotador no llega a Scraper ni Clasificador; que dos anotadores ven las mismas 100 primeras oraciones y luego órdenes distintos; que el Banco oculta anotaciones ajenas del bloque; que el resumen aparece; y consultas SQL de solo lectura para validar el estado de `usuarios`, `anotadores` y `bloque_compartido`.
