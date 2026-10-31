# Registro de anotadores, cola aleatoria y guía de anotación — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que otros anotadores se registren y Rubén (`ru`, admin) los apruebe, que cada uno reciba oraciones aleatorias con un bloque compartido de 100, vea el resumen del evento y una guía clara con ejemplos mixtos.

**Architecture:** Se extiende `usuarios` con datos de registro y estado; el anotador activo se deduce siempre de la sesión en el servidor. La cola se calcula en una función SQL única (`api/lib/cola.js`) que entrega primero el bloque congelado en `bloque_compartido` y después un orden estable por anotador. La lógica pura (validaciones) vive en módulos con pruebas `node:test`; el resto se verifica contra la API local con `curl` y consultas SQL de solo lectura.

**Tech Stack:** Node 24 + Express 4 + pg + bcrypt + jsonwebtoken + express-rate-limit (API); React 19 + Vite + react-router-dom 7 (web); PostgreSQL 17 local; `node --test` para pruebas.

**Spec:** `docs/superpowers/specs/2026-10-30-registro-anotadores-design.md`

## Global Constraints

- Principio aditivo: no se elimina funcionalidad; `SeleccionAnotador` y `POST /anotadores` se conservan (el POST pasa a solo admin).
- Migraciones SQL idempotentes en `sql/`, aplicadas a mano; no tocan datos existentes salvo las dos operaciones puntuales de la spec (enlazar `ru`, borrar anotador 2).
- Registro: nombre ≥ 3 caracteres; celular de 10 dígitos (México), se guarda normalizado; contraseña ≥ 8 caracteres; bcrypt costo 12; email en minúsculas y es el `usuario` de login.
- `estado` ∈ `pendiente | aprobado | rechazado`; cuentas existentes quedan `aprobado`, las nuevas `pendiente`.
- Bloque compartido: exactamente 100 oraciones, congeladas en `bloque_compartido(oracion_id PK, orden)`, elegidas por menor `MD5('bloque' || id)`.
- Cola: bloque pendiente en su orden; después aleatorio por oración con `MD5(oracion_id || anotador_id)` prefiriendo oraciones que nadie más anotó; se excluyen `compleja`, `descartada` y las ya anotadas (versión 1) por ese anotador.
- Obligatorio: categoría; en B y C al menos un elemento con alternativa neutral; subtipo si se escribe un elemento. Opcional: elementos en A, confianza (por defecto "alta"), notas.
- El anotador no ve etiquetas de ningún agente, ni anotaciones ajenas del bloque (Banco); nunca se expone email ni celular a otros anotadores.
- Scraper y Clasificador siguen solo admin. Pruebas locales con `VITE_API_URL=http://localhost:3001` y frontend en `http://localhost:5173` (CORS).

## Review Focus

- Email repetido con otro uso de mayúsculas: misma respuesta genérica y no se crea una segunda fila (Task 2).
- Cuenta pendiente o rechazada con contraseña incorrecta: mensaje genérico, sin revelar el estado (Task 2).
- Admin o cuenta sin `anotador_id` que llama a la cola: 403 con mensaje claro, no un 500 (Task 4).
- Oración del bloque marcada `compleja` o `descartada` por alguien: no se entrega a nadie, el bloque no se rehace (Task 5).
- Re-ejecutar la migración o crecer el corpus: el bloque no cambia ni se duplica (Task 1).

---

### Task 1: Rama y migración SQL

**Files:**
- Create: `sql/registro_anotadores.sql`

**Interfaces:**
- Produces: columnas `usuarios.nombre_completo, email, celular, estado, revisado_por, revisado_en, motivo_rechazo`; tabla `bloque_compartido(oracion_id INT PK REFERENCES oraciones(id), orden INT NOT NULL)` con 100 filas; `ru` enlazado a `anotadores.id = 1`; anotador 2 eliminado.

- [ ] **Step 1:** `git switch main && git switch -c feature/registro-anotadores`.
- [ ] **Step 2:** Escribir `sql/registro_anotadores.sql`, idempotente y con el estilo de comentarios de `sql/crear_tabla_usuarios.sql`: `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS …` (`estado TEXT NOT NULL DEFAULT 'aprobado' CHECK (...)`), `CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_key ON usuarios (lower(email))`, `CREATE TABLE IF NOT EXISTS bloque_compartido`, el `INSERT … SELECT` del bloque solo `WHERE NOT EXISTS (SELECT 1 FROM bloque_compartido)` sobre oraciones no `compleja` ni `descartada` ordenadas por `MD5('bloque' || id)` con `row_number()` como `orden`, `UPDATE usuarios SET anotador_id = 1 WHERE usuario = 'ru' AND anotador_id IS NULL`, y `DELETE FROM anotadores WHERE id = 2 AND nombre = 'María Cristina Justo Hernández'` con `AND NOT EXISTS` sobre `anotaciones`, `sesiones_kappa` (ambas columnas) y `usuarios`. Después del `ALTER`, el default de `estado` para filas nuevas debe ser `'pendiente'`: `ALTER COLUMN estado SET DEFAULT 'pendiente'` tras haber rellenado las existentes.
- [ ] **Step 3:** Aplicarla a la BD local dos veces con `psql -f` (credenciales de `.env`, sin mostrarlas).
- [ ] **Step 4: Verificar** con SQL de solo lectura: `count(*) FROM bloque_compartido` = 100 y no cambia tras la segunda corrida; `SELECT anotador_id FROM usuarios WHERE usuario='ru'` = 1; `SELECT count(*) FROM anotadores WHERE id=2` = 0; `SELECT estado FROM usuarios` = `aprobado`.
- [ ] **Step 5:** Commit `sql/registro_anotadores.sql`.

### Task 2: Registro y login con estado

**Files:**
- Create: `api/lib/registro.js`, `api/lib/registro.test.js`
- Modify: `api/routes/auth.js`, `api/package.json` (script `"test": "node --test lib/"`)

**Interfaces:**
- Produces: `validarRegistro(entrada: {nombre_completo, email, celular, password}) -> { ok: true, datos: {nombre_completo, email, celular} } | { ok: false, errores: string[] }` (email en minúsculas; celular solo 10 dígitos, aceptando espacios, guiones y prefijo `+52`); `POST /api/auth/registro`; `POST /api/auth/login` ahora acepta usuario o email y responde `{id, usuario, rol, anotador_id}`.

- [ ] **Step 1: Pruebas que fallan** en `registro.test.js`: `acepta datos válidos y normaliza email y celular` (`" Ana@Mail.COM "` → `ana@mail.com`; `"+52 492-123-4567"` → `"4921234567"`); `rechaza nombre corto`; `rechaza email sin arroba`; `rechaza celular de 9 dígitos`; `rechaza contraseña de 7 caracteres`; `reporta todos los errores a la vez`.
- [ ] **Step 2:** `cd api && node --test lib/` → FAIL (módulo inexistente).
- [ ] **Step 3:** Implementar `api/lib/registro.js`. Correr de nuevo → PASS.
- [ ] **Step 4:** En `auth.js` agregar `POST /registro` con su propio `rateLimit` (5 por hora por IP, mensaje en español). Inserta `usuario = email`, `rol='anotador'`, `estado='pendiente'`, hash bcrypt costo 12. **Siempre** responde `200 {ok:true, mensaje}` igual aunque el email exista (`ON CONFLICT DO NOTHING`); los errores de validación sí devuelven 400.
- [ ] **Step 5:** En `login`: buscar por `usuario = $1 OR lower(email) = lower($1)`; comparar contraseña **primero**; solo con contraseña correcta, si `estado` es `pendiente` o `rechazado` responder 403 con mensaje específico; con incorrecta, el 401 genérico de siempre. Incluir `anotador_id` en el JWT, en la respuesta y en `/me`.
- [ ] **Step 6: Verificar** con `curl` contra la API local: registro nuevo → 200; mismo email con otro casing → 200 y `SELECT count(*) FROM usuarios WHERE lower(email)=…` sigue en 1; login de esa cuenta con clave correcta → 403 "pendiente"; con clave incorrecta → 401 genérico; login de `ru` sigue funcionando.
- [ ] **Step 7:** Commit.

### Task 3: API de solicitudes (admin)

**Files:**
- Create: `api/routes/admin.js`
- Modify: `api/index.js` (montar `/api/admin` con `requireAuth, requireRole("admin")`)

**Interfaces:**
- Produces: `GET /api/admin/solicitudes?estado=pendiente|aprobado|rechazado` → `[{id, nombre_completo, email, celular, estado, creado_en}]`; `GET /api/admin/solicitudes/contador` → `{pendientes: number}`; `POST /api/admin/solicitudes/:id/aprobar` body `{anotador_id?: number}`; `POST /api/admin/solicitudes/:id/rechazar` body `{motivo?: string}`.

- [ ] **Step 1:** Implementar las rutas. Aprobar corre en transacción: sin `anotador_id` crea el perfil en `anotadores(nombre = nombre_completo, descripcion = 'Anotador')`; con `anotador_id` comprueba que exista y que ningún otro usuario lo tenga ya; luego `estado='aprobado'`, `anotador_id`, `revisado_por = req.usuario.id`, `revisado_en = now()`. Rechazar guarda `motivo_rechazo`. Solo actúan sobre filas `pendiente` (si no, 409).
- [ ] **Step 2: Verificar** con `curl` autenticado como `ru` (cookie): listar → aparece la cuenta de prueba; aprobarla crea el anotador y enlaza; la cuenta ya puede entrar (Task 2); una segunda aprobación → 409; sin sesión admin → 401/403.
- [ ] **Step 3:** Commit.

### Task 4: Identidad desde la sesión

**Files:**
- Modify: `api/middleware/auth.js`, `api/routes/anotacion.js`, `api/index.js`

**Interfaces:**
- Produces: `requireAnotador` (middleware, tras `requireAuth`): lee de la BD `anotador_id` y `estado` del usuario; si no hay perfil → 403 `{error: "Tu cuenta no tiene perfil de anotador"}`; si `estado != 'aprobado'` → 403; deja `req.anotadorId: number`.

- [ ] **Step 1:** Implementar `requireAnotador` y aplicarlo al router de anotación en `index.js`, después de `requireRole("anotador","admin")`.
- [ ] **Step 2:** En `anotacion.js`: `/oraciones`, `/stats/:anotador_id`, `/anotar` y `DELETE /:id` usan `req.anotadorId` y **ignoran** `anotador_id` de query, params y body; `DELETE /:id` responde 403 si la anotación no es del usuario; `POST /anotadores` pasa a `requireRole("admin")`. Dejar un comentario breve de por qué se ignora el id del cliente.
- [ ] **Step 3: Verificar** con `curl` como `ru` (anotador 1): `/anotar` con `anotador_id: 99` en el body guarda con 1; `DELETE` de una anotación de otro anotador → 403; con una cuenta admin sin enlace → 403 con el mensaje (Review Focus 3).
- [ ] **Step 4:** Commit.

### Task 5: Cola con bloque compartido y resumen del evento

**Files:**
- Create: `api/lib/cola.js`, `api/lib/cola.test.js`
- Modify: `api/routes/anotacion.js` (`GET /oraciones` y `GET /stats`)

**Interfaces:**
- Produces: `obtenerCola(pool, anotadorId: number, limite: number) -> Promise<Array<{id, texto, contexto_prev, contexto_sig, posicion, num_palabras, articulo_id, titular_articulo, fuente, orientacion, evento_id, titular_evento, resumen, en_bloque: boolean}>>`; `/stats` añade `bloque: {hechas: number, total: number}`.

- [ ] **Step 1: Pruebas que fallan** en `cola.test.js` (solo lectura contra la BD local; se omiten si no hay conexión; `after(() => pool.end())`): `las primeras 100 son el bloque, iguales para dos anotadores` (ids 1 y 999999, `en_bloque` true y mismo orden); `después del bloque el orden difiere entre anotadores`; `no hay ids repetidos`; `excluye lo ya anotado por ese anotador` (anotador 1 con sus 169); `no entrega oraciones compleja o descartada, incluidas las del bloque` (Review Focus 4); `cada fila trae resumen`.
- [ ] **Step 2:** Correr → FAIL.
- [ ] **Step 3:** Implementar `obtenerCola` con una sola consulta: `LEFT JOIN bloque_compartido b`, orden `(b.oracion_id IS NULL), b.orden, EXISTS(otra anotación v1 de otro anotador), MD5(o.id::text || $1::text)`, `LIMIT $2`; filtros de exclusión de la spec. `GET /oraciones` la usa (conserva el parámetro `limite`) y `GET /stats` suma `bloque`.
- [ ] **Step 4:** Correr → PASS. Verificar `/oraciones` con `curl`: trae `resumen` y `en_bloque`.
- [ ] **Step 5:** Commit.

### Task 6: Aislamiento del Banco

**Files:**
- Modify: `api/routes/anotacion.js` (`GET /banco`)
- Create: `api/lib/banco-aislamiento.test.js` solo si el filtro se extrae a una función; si no, verificación por `curl`.

**Interfaces:**
- Consumes: `req.anotadorId` (Task 4), `req.usuario.rol`.

- [ ] **Step 1:** Para rol distinto de `admin`, excluir de `/banco` las anotaciones **de otros** sobre oraciones presentes en `bloque_compartido`; las propias siguen visibles. El admin ve todo.
- [ ] **Step 2: Verificar** (con una anotación temporal de prueba de otro anotador sobre una oración del bloque, que se borra al terminar): como anotador no-admin no aparece; como `ru` aparece.
- [ ] **Step 3:** Commit.

### Task 7: Frontend de registro y aprobación

**Files:**
- Create: `web/src/pages/Registro.jsx`, `web/src/pages/Solicitudes.jsx`
- Modify: `web/src/api.js`, `web/src/App.jsx`, `web/src/pages/Login.jsx`, `web/src/AuthContext.jsx` (si hace falta exponer `anotador_id`)

**Interfaces:**
- Produces (en `api.js`): `registrarse(datos)`, `getSolicitudes(estado)`, `getContadorSolicitudes()`, `aprobarSolicitud(id, anotadorId?)`, `rechazarSolicitud(id, motivo?)`; rutas `/registro` (pública) y `/solicitudes` (`RouteGuard roles={["admin"]}`).

- [ ] **Step 1:** `Registro.jsx` con estilo de `Login.jsx` (`filter-input`, `page-title`), campos de la spec, validación de cliente equivalente a `validarRegistro` y pantalla de "solicitud enviada, espera la aprobación". Enlace "Crear cuenta" en `Login.jsx`.
- [ ] **Step 2:** `Solicitudes.jsx`: tabs pendiente/aprobado/rechazado, tarjeta por solicitud con nombre, email y celular; Aprobar con selector "Crear perfil nuevo / vincular a: …" (lista de `getAnotadores`), Rechazar con motivo opcional; mensajes de error del backend.
- [ ] **Step 3:** En `App.jsx`: rutas nuevas y enlace "Solicitudes" para admin con un contador numérico de pendientes que se consulta al montar la barra.
- [ ] **Step 4: Verificar** en el navegador local (`http://localhost:5173`, API con `VITE_API_URL`): registrar, ver el contador, aprobar vinculando y entrar con esa cuenta; `npx eslint` sin errores nuevos; `npx vite build` correcto.
- [ ] **Step 5:** Commit.

### Task 8: Anotación con identidad de sesión, resumen y validación

**Files:**
- Create: `web/src/anotacion/validar.js`, `web/src/anotacion/validar.test.js`, `web/src/components/ResumenEvento.jsx`
- Modify: `web/src/pages/Anotacion.jsx`, `api/lib/validar-anotacion.js` (nuevo, espejo backend) con `api/lib/validar-anotacion.test.js`, `api/routes/anotacion.js` (`/anotar` valida)

**Interfaces:**
- Produces (idéntica firma en front y back): `validarAnotacion(categoria: 'A'|'B'|'C'|null, elementos: Array<{elemento, alternativa, tipo, subtipo}>) -> string[]` (lista de errores en español; vacía = válida). Reglas: sin categoría → error; B/C sin ningún elemento con texto → error; B/C con elemento sin `alternativa` → error; cualquier elemento con texto sin `subtipo` → error; A sin elementos es válida.

- [ ] **Step 1: Pruebas que fallan** (mismas en ambos módulos): `A sin elementos es válida`; `sin categoría falla`; `B sin elementos falla`; `C con elemento sin alternativa falla`; `elemento con texto y sin subtipo falla`; `elementos vacíos se ignoran`; `B completo es válido`.
- [ ] **Step 2:** `node --test` en `api/` y en `web/` (`node --test src/anotacion/`; si `web/package.json` no tiene `"type": "module"`, usar `.mjs`) → FAIL.
- [ ] **Step 3:** Implementar ambos módulos → PASS. `/anotar` responde 400 con la lista de errores.
- [ ] **Step 4:** En `Anotacion.jsx`: el paso "anotador" se omite y el anotador sale de la sesión (`/me` incluye `anotador: {id, nombre}`; ajustar `/auth/me` y `login` en el backend si aún no lo hacen); el indicador de pasos pasa a "1. Instrucciones, 2. Anotar". `handleGuardar` y el botón Guardar usan `validarAnotacion` y muestran los errores bajo el botón. La etiqueta "PRUEBA PILOTO" usa `stats.bloque` (`n/100`) en lugar de `guardadas < 50`, y el aviso de piloto completado aparece cuando `hechas === total`.
- [ ] **Step 5:** `ResumenEvento.jsx({titular, resumen})`: bloque plegable, abierto por defecto, preferencia en `localStorage` dentro de try/catch, "Sin resumen disponible" si no hay resumen; se muestra arriba del contexto anterior. Estilo coherente con `motion.css` (clase `vista-enter`).
- [ ] **Step 6: Verificar** en el navegador: cuenta aprobada ve las 100 del bloque primero y el resumen; Guardar queda deshabilitado con B sin alternativa y muestra el motivo; eslint y build limpios.
- [ ] **Step 7:** Commit.

### Task 9: Guía de flujo y ejemplos mixtos

**Files:**
- Create: `web/src/anotacion/ejemplosMixtos.js`, `web/src/anotacion/guiaCampos.js`
- Modify: `web/src/pages/Anotacion.jsx` (`PanelEjemplos`, `Instrucciones`), `web/src/motion.css` solo si hace falta una clase nueva

**Interfaces:**
- Produces: `EJEMPLOS_MIXTOS: Array<{texto, elementos: Array<{t, tipo, subtipo, alt?}>, dominante: 'A'|'B'|'C', porque: string}>` con al menos un caso por combinación A+B, A+C, B+C y A+B+C, y casos donde cada categoría es la dominante; `GUIA_CAMPOS: Array<{campo, estado: 'Obligatorio'|'Recomendado'|'Opcional', detalle}>` con la tabla de la spec; `CASOS_LIMITE: Array<{titulo, texto}>` tomados de `docs/agente_anotacion_abc.md` (cita de columnista, jerga institucional de seguridad, cifra sin fuente, Compleja vs Ruido).

- [ ] **Step 1:** Redactar los datos. El campo `porque` debe decir siempre que la dominante se elige viendo la oración completa, no contando elementos, e incluir al menos un caso donde un solo C domina frente a varios A.
- [ ] **Step 2:** En `PanelEjemplos` agregar las pestañas "Mixtas" y "Guía" junto a A, B y C: Mixtas muestra la oración con los fragmentos resaltados, la lista `tipo·subtipo`, la dominante y el porqué; Guía muestra `GUIA_CAMPOS` y `CASOS_LIMITE`. Mantener `onMouseDown` sin foco en los botones.
- [ ] **Step 3:** En `Instrucciones` añadir la tabla de `GUIA_CAMPOS` y una frase de la regla de la dominante.
- [ ] **Step 4: Verificar** en el navegador: las pestañas cambian sin tocar la anotación en curso; los atajos A/B/C/Enter siguen funcionando; eslint y build limpios.
- [ ] **Step 5:** Commit.

### Task 10: Bitácora y verificación de punta a punta

**Files:**
- Create: `docs/bitacora/2026-10-30-registro-anotadores-cola.md`
- Modify: nota en `C:\Users\rubis\Documents\Obsidian Vaults\Alt Del\Thesis\0. Bitácora\` (fuera del repo, sin commit; seguir el formato de las notas existentes allí)

- [ ] **Step 1:** Escribir la entrada con el formato de `docs/bitacora/2026-09-07-candidatos-pendientes.md` (fase KDD, módulos, contexto, decisiones y justificación): registro con aprobación, identidad desde la sesión, cola con bloque de 100 y por qué el Kappa lo exige, aislamiento del Banco, reglas de obligatorio/opcional, guía y ejemplos mixtos, y los datos personales (email, celular) sin aviso específico por decisión del autor.
- [ ] **Step 2:** Crear la nota equivalente en la bitácora del vault.
- [ ] **Step 3: Verificación completa** (sección 8 de la spec): `cd api && node --test lib/` y `cd web && node --test src/anotacion/` en verde; recorrer en local registrar → aprobar/rechazar → anotar con dos cuentas (mismas 100 primeras, luego órdenes distintos) → Banco sin anotaciones ajenas del bloque → Scraper y Clasificador inaccesibles para un anotador (403 en API, redirección en web) → eslint y build. Limpiar las cuentas y anotaciones de prueba creadas.
- [ ] **Step 4:** Commit de la bitácora del repo. Recordar que la migración `sql/registro_anotadores.sql` se aplica a mano en producción.
