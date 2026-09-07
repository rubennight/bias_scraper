// orientaciones.js — única fuente de verdad para las orientaciones
// editoriales en el frontend.
//
// Por qué existe: EventoDetalle.jsx, Dashboard.jsx y Eventos.jsx tenían
// cada uno su propia lista fija ORDER con solo 4 valores (izquierda,
// critico, centro, derecha), y filtraban/iteraban SOLO sobre esa lista.
// La tabla `fuentes` en la BD tiene 6 valores reales de orientacion
// (agrega regional y centro-derecha) — cualquier fuente con una
// orientación fuera de esas 4 quedaba invisible en toda la UI, no solo
// mal contada. El caso extremo: si TODAS las fuentes de un evento caen
// en una orientación no reconocida, el evento se veía completamente
// vacío aunque el backend tuviera los artículos correctos.
//
// La corrección: no hardcodear qué orientaciones existen. Los
// componentes derivan las columnas/segmentos de lo que realmente
// aparece en los datos (ordenOrientaciones), y este módulo solo aporta
// el label legible — con un fallback para cualquier valor futuro que
// aún no esté en el mapa, en vez de que ese valor desaparezca.

export const ORIENTACION_LABEL = {
  izquierda: "Izquierda",
  critico: "Crítico",
  centro: "Centro",
  "centro-derecha": "Centro-derecha",
  derecha: "Derecha",
  regional: "Regional",
};

export function labelOrientacion(clave) {
  if (ORIENTACION_LABEL[clave]) return ORIENTACION_LABEL[clave];
  // Fallback para una orientación nueva que aún no se agregó al mapa:
  // capitaliza la clave tal cual en vez de ocultarla.
  return clave ? clave.charAt(0).toUpperCase() + clave.slice(1) : "Sin orientación";
}

// Orden "editorial" preferido para las orientaciones conocidas —
// izquierda a derecha, con "regional" (fuera del eje) al final.
const ORDEN_PREFERIDO = ["izquierda", "critico", "centro", "centro-derecha", "derecha", "regional"];

// Deriva el orden de columnas/segmentos a partir de las claves que
// REALMENTE aparecen en los datos, en vez de una lista fija. Las
// conocidas van primero en el orden editorial; cualquier clave nueva
// (aún no contemplada) se agrega al final, ordenada alfabéticamente,
// para que nunca quede fuera de la vista.
export function ordenOrientaciones(claves) {
  const presentes = new Set(Array.from(claves).filter(Boolean));
  const conocidas = ORDEN_PREFERIDO.filter(k => presentes.has(k));
  const desconocidas = [...presentes]
    .filter(k => !ORDEN_PREFERIDO.includes(k))
    .sort();
  return [...conocidas, ...desconocidas];
}
