// lib/registro.js — Validación y normalización de los datos de registro.
// Función pura: sin acceso a BD, para poder probarla sola.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function soloDigitos(valor) {
  return String(valor ?? "").replace(/\D/g, "");
}

// Devuelve { ok: true, datos } con email en minúsculas y celular de 10
// dígitos (se acepta espacios, guiones y prefijo +52), o
// { ok: false, errores } con todos los errores a la vez.
// La contraseña solo se valida; nunca se devuelve en `datos`.
function validarRegistro(entrada = {}) {
  const nombre   = String(entrada.nombre_completo ?? "").trim();
  const email    = String(entrada.email ?? "").trim().toLowerCase();
  let   celular  = soloDigitos(entrada.celular);
  const password = String(entrada.password ?? "");

  if (celular.length === 12 && celular.startsWith("52")) celular = celular.slice(2);

  const errores = [];
  if (nombre.length < 3)        errores.push("El nombre completo debe tener al menos 3 caracteres");
  if (!EMAIL_RE.test(email))    errores.push("El email no es válido");
  if (celular.length !== 10)    errores.push("El celular debe tener 10 dígitos");
  if (password.length < 8)      errores.push("La contraseña debe tener al menos 8 caracteres");

  if (errores.length) return { ok: false, errores };
  return { ok: true, datos: { nombre_completo: nombre, email, celular } };
}

module.exports = { validarRegistro };
