-- =============================================================
-- registro_anotadores.sql — Registro con aprobación, bloque compartido
--
-- Prepara la BD para que otros anotadores se registren y el admin los
-- apruebe, y para repartir las oraciones con un bloque compartido de
-- 100 (necesario para calcular el Kappa entre anotadores).
-- Spec: docs/superpowers/specs/2026-10-30-registro-anotadores-design.md
--
-- Idempotente: seguro de correr varias veces. Solo agrega columnas y una
-- tabla; las dos únicas operaciones sobre datos existentes están al final
-- (enlazar `ru` con su perfil y borrar el perfil de anotador de María
-- Cristina Justo Hernández) y ambas están protegidas.
--
-- ORDEN DE DESPLIEGUE: aplicar este archivo ANTES de desplegar la API
-- nueva. El login lee `usuarios.estado`; si la API nueva arranca sin esta
-- migración, todos los inicios de sesión (incluido el del admin) fallan.
--
-- Aplicar manualmente en producción (Adminer, psql, etc.) — este
-- archivo no se ejecuta automático desde ningún lado.
-- =============================================================

-- ── Datos de registro y estado de la cuenta ─────────────────
-- Al agregar `estado` con DEFAULT 'aprobado', las cuentas que ya existen
-- quedan aprobadas. Justo después el default pasa a 'pendiente' para las
-- cuentas nuevas (el ALTER de abajo no modifica filas ya creadas).
ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS nombre_completo TEXT,
    ADD COLUMN IF NOT EXISTS email           TEXT,
    ADD COLUMN IF NOT EXISTS celular         TEXT,
    ADD COLUMN IF NOT EXISTS estado          TEXT NOT NULL DEFAULT 'aprobado',
    ADD COLUMN IF NOT EXISTS revisado_por    INTEGER REFERENCES usuarios(id),
    ADD COLUMN IF NOT EXISTS revisado_en     TIMESTAMP,
    ADD COLUMN IF NOT EXISTS motivo_rechazo  TEXT;

ALTER TABLE usuarios ALTER COLUMN estado SET DEFAULT 'pendiente';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_estado_check') THEN
        ALTER TABLE usuarios
            ADD CONSTRAINT usuarios_estado_check
            CHECK (estado IN ('pendiente', 'aprobado', 'rechazado'));
    END IF;
END $$;

-- Email único sin distinguir mayúsculas. Las cuentas sin email (como
-- `ru`) no chocan: NULL no cuenta como duplicado en un índice único.
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_key ON usuarios (lower(email));

-- Acelera el contador de solicitudes pendientes.
CREATE INDEX IF NOT EXISTS idx_usuarios_estado ON usuarios (estado);

-- ── Bloque compartido de 100 oraciones ──────────────────────
-- Congelado en una tabla: si se calculara al vuelo, las oraciones nuevas
-- de un scrape podrían entrar al top 100 y el bloque cambiaría.
CREATE TABLE IF NOT EXISTS bloque_compartido (
    oracion_id INTEGER PRIMARY KEY REFERENCES oraciones(id),
    orden      INTEGER NOT NULL
);

-- Solo se llena una vez: si ya tiene filas, no hace nada. Se eligen solo
-- oraciones con artículo, fuente y evento (las mismas uniones de la cola
-- de anotación): una oración de un artículo sin evento nunca se mostraría
-- y el bloque no se podría completar.
INSERT INTO bloque_compartido (oracion_id, orden)
SELECT id, row_number() OVER (ORDER BY MD5('bloque' || id::text), id)
FROM (
    SELECT o.id
    FROM oraciones o
    JOIN articulos a  ON a.id  = o.articulo_id
    JOIN fuentes   f  ON f.id  = a.fuente_id
    JOIN eventos   ev ON ev.id = a.evento_id
    WHERE (o.compleja   IS NULL OR o.compleja   = FALSE)
      AND (o.descartada IS NULL OR o.descartada = FALSE)
    ORDER BY MD5('bloque' || o.id::text), o.id
    LIMIT 100
) elegidas
WHERE NOT EXISTS (SELECT 1 FROM bloque_compartido);

-- ── Cuentas y perfiles existentes ───────────────────────────
-- `ru` (admin) pasa a anotar con el perfil de Rubén Jiménez Navarro.
UPDATE usuarios
SET anotador_id = 1
WHERE usuario = 'ru' AND anotador_id IS NULL;

-- Se borra el perfil de María Cristina Justo Hernández (id 2) solo si
-- nada lo referencia: si en este entorno ya tiene anotaciones, sesiones
-- de Kappa o una cuenta enlazada, no se borra nada.
DELETE FROM anotadores a
WHERE a.id = 2
  AND a.nombre = 'María Cristina Justo Hernández'
  AND NOT EXISTS (SELECT 1 FROM anotaciones    WHERE anotador_id = a.id)
  AND NOT EXISTS (SELECT 1 FROM sesiones_kappa WHERE anotador1_id = a.id OR anotador2_id = a.id)
  AND NOT EXISTS (SELECT 1 FROM usuarios       WHERE anotador_id  = a.id);
