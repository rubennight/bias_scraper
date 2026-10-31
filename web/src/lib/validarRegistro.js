// Validación de cliente del formulario de registro. Refleja las reglas de
// api/lib/registro.js (el servidor siempre vuelve a validar); aquí solo
// sirve para avisar antes de enviar. Devuelve la lista de errores.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validarRegistro({ nombre_completo, email, celular, password, confirmacion }) {
  let digitos = String(celular ?? "").replace(/\D/g, "");
  if (digitos.length === 12 && digitos.startsWith("52")) digitos = digitos.slice(2);

  const errores = [];
  if (String(nombre_completo ?? "").trim().length < 3) errores.push("El nombre completo debe tener al menos 3 caracteres");
  if (!EMAIL_RE.test(String(email ?? "").trim())) errores.push("El email no es válido");
  if (digitos.length !== 10) errores.push("El celular debe tener 10 dígitos");
  if (String(password ?? "").length < 8) errores.push("La contraseña debe tener al menos 8 caracteres");
  if (password !== confirmacion) errores.push("Las contraseñas no coinciden");
  return errores;
}
