// lib/banco.js — Aislamiento del Banco de Anotaciones.
//
// Un anotador (no admin) no debe ver cómo clasificaron OTROS las oraciones
// del bloque compartido: lo vería antes de anotarlas él mismo y el Kappa
// saldría inflado. Las propias y las oraciones fuera del bloque siguen
// visibles. El admin lo ve todo.

// Devuelve la condición SQL (sobre el alias `an` de `anotaciones`) y agrega
// su parámetro a `params`; null si no hay nada que restringir (admin).
function condicionAislamiento(rol, anotadorId, params) {
  if (rol === "admin") return null;
  params.push(anotadorId);
  return `(an.anotador_id = $${params.length}
           OR an.oracion_id NOT IN (SELECT oracion_id FROM bloque_compartido))`;
}

module.exports = { condicionAislamiento };
