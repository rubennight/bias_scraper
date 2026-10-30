// lib/login.js — Decisión del login según la cuenta y la contraseña.
// Función pura. Se evalúa DESPUÉS de comparar la contraseña: con una
// contraseña incorrecta (o una cuenta inexistente) la respuesta es siempre
// el mismo 401 genérico, así no se puede averiguar si una cuenta existe ni
// en qué estado está. Solo con la contraseña correcta se informa que la
// cuenta está pendiente o fue rechazada.

const GENERICO = "Usuario o contraseña incorrectos";

function decidirLogin(fila, claveValida) {
  if (!fila || !claveValida) return { status: 401, error: GENERICO };
  if (fila.estado === "pendiente") return { status: 403, error: "Tu cuenta está pendiente de aprobación" };
  if (fila.estado === "rechazado") return { status: 403, error: "Tu solicitud fue rechazada" };
  return { status: 200 };
}

module.exports = { decidirLogin };
