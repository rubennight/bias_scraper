-- =============================================================
-- crear_tabla_usuarios.sql — Sistema de autenticación (login)
--
-- Agrega la tabla `usuarios` para el login con JWT. Idempotente:
-- seguro de correr aunque la tabla ya exista. NO toca ninguna tabla
-- existente ni sus datos (articulos, eventos, anotaciones,
-- anotadores, entrenamientos, etc. quedan intactas).
--
-- `usuarios` es un concepto DISTINTO de `anotadores`: `anotadores` es
-- la identidad autodeclarada de quién anota una oración (sin
-- password, ya tiene datos reales enganchados vía FK desde
-- `anotaciones` y `sesiones_kappa`) — este login no la reemplaza ni
-- la modifica. `anotador_id` abajo es un enlace OPCIONAL para uso
-- futuro (por ejemplo, auto-seleccionar el perfil de anotador a
-- partir de la sesión); hoy no lo usa ningún código todavía.
--
-- Aplicar manualmente en producción (Adminer, psql, etc.) — este
-- archivo no se ejecuta automático desde ningún lado.
-- =============================================================

CREATE TABLE IF NOT EXISTS usuarios (
    id            SERIAL PRIMARY KEY,
    usuario       TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    rol           TEXT NOT NULL CHECK (rol IN ('admin', 'anotador')),
    -- Enlace opcional a la identidad de anotación existente — nullable,
    -- sin ON DELETE CASCADE a propósito (borrar un anotador con
    -- historial real no debería borrar la cuenta de login).
    anotador_id   INTEGER REFERENCES anotadores(id),
    creado_en     TIMESTAMP NOT NULL DEFAULT now()
);

-- Único por nombre de usuario — necesario para el login y para que
-- el script de creación de admin pueda hacer upsert (ON CONFLICT).
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_usuario_key ON usuarios (usuario);

-- Acelera la revisión "¿quién es admin?" si algún día se necesita
-- listar/filtrar por rol.
CREATE INDEX IF NOT EXISTS idx_usuarios_rol ON usuarios (rol);
