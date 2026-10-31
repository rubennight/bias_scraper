// Espejo de api/lib/validar-anotacion.js: avisa en el formulario antes de
// enviar. El servidor siempre vuelve a validar.
//
// Obligatorio: la categoría dominante; en B y C al menos un elemento de
// tipo B o C con su alternativa neutral; subtipo en todo elemento con texto.
// Opcional: elementos en A, confianza y notas.
// Devuelve la lista de errores en español (vacía = válida).

export function validarAnotacion(categoria, elementos = []) {
  if (!["A", "B", "C"].includes(categoria)) {
    return ["Elige una categoría dominante (A, B o C)"];
  }

  const errores = [];
  const conTexto = (elementos || []).filter(e => String(e?.elemento ?? "").trim());

  for (const e of conTexto) {
    const nombre = String(e.elemento).trim();
    if (!String(e.subtipo ?? "").trim()) {
      errores.push(`El elemento «${nombre}» necesita un subtipo`);
    }
    if ((e.tipo === "B" || e.tipo === "C") && !String(e.alternativa ?? "").trim()) {
      errores.push(`El elemento «${nombre}» necesita una alternativa neutral`);
    }
  }

  if (categoria !== "A" && !conTexto.some(e => e.tipo === "B" || e.tipo === "C")) {
    errores.push("En B y C registra al menos un elemento de sesgo con su alternativa neutral");
  }

  return errores;
}
