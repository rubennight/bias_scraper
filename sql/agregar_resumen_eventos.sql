-- =============================================================
-- agregar_resumen_eventos.sql — Título y resumen generados por IA
--
-- Agrega la columna `resumen` a `eventos`. Idempotente: seguro de
-- correr aunque ya exista. NO toca ninguna otra tabla ni borra datos.
--
-- titular_evento NO cambia de tipo/esquema — pipeline.py empieza a
-- sobreescribir su contenido con un título generado por Claude en vez
-- del titular más largo del cluster (elegido algorítmicamente), pero
-- la columna en sí ya existía. resumen es nueva y nullable: los
-- eventos ya guardados quedan con resumen = NULL hasta que se vuelva
-- a correr el pipeline sobre ellos (o se generen manualmente aparte);
-- el frontend cae de vuelta al texto genérico mientras tanto.
--
-- Aplicar manualmente en producción (Adminer, psql, etc.) — este
-- archivo no se ejecuta automático desde ningún lado.
-- =============================================================

ALTER TABLE eventos ADD COLUMN IF NOT EXISTS resumen TEXT;
