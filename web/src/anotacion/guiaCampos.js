// Guía de anotación: qué es obligatorio y qué opcional, los pasos para
// clasificar y los casos límite. Las reglas de obligatorio/opcional son las
// mismas que valida web/src/anotacion/validar.js (y el servidor).

export const REGLA_DOMINANTE =
  "La categoría dominante se elige viendo la oración completa, no contando elementos. Un solo elemento C puede dominar una oración con varios A si orienta toda la lectura.";

export const GUIA_CAMPOS = [
  { campo: "Categoría dominante (A, B o C)", estado: "Obligatorio",
    detalle: "Sin ella no se puede guardar." },
  { campo: "Elementos en A", estado: "Opcional",
    detalle: "Puedes marcar los hechos verificables, pero no es necesario." },
  { campo: "Elementos en B y C", estado: "Obligatorio",
    detalle: "Al menos un elemento de sesgo (tipo B o C) con su alternativa neutral." },
  { campo: "Alternativa neutral", estado: "Obligatorio",
    detalle: "En todo elemento de tipo B o C. Si la evaluación solo se elimina, escribe «se elimina»." },
  { campo: "Subtipo del elemento", estado: "Obligatorio",
    detalle: "En todo elemento que escribas, sea A, B o C." },
  { campo: "Confianza", estado: "Opcional",
    detalle: "Por defecto es «alta». Bájala a «media» o «baja» si dudas." },
  { campo: "Notas", estado: "Recomendado",
    detalle: "Úsalas para documentar dudas, por ejemplo «podría ser B o C; decidí C porque…»." },
  { campo: "Compleja / Ruido", estado: "Opcional",
    detalle: "Solo cuando aplique. Excluyen la oración del entrenamiento y pasan a la siguiente." },
];

export const PASOS = [
  "Lee el resumen del evento y el contexto anterior y siguiente de la oración.",
  "Identifica la atribución: ¿lo dice el periodista o lo dice una fuente? Entre comillas y con atribución, el vocabulario es de la fuente.",
  "Aplica los tres tests: falsificabilidad (A), eliminación (B) y sustitución por un sinónimo más neutral (C).",
  "Elige la categoría dominante mirando la oración completa.",
  "Registra los elementos con su subtipo. En B y C, agrega la alternativa neutral.",
  "Ajusta la confianza si dudas y deja una nota si la oración es un caso límite.",
  "Guarda. Si la oración no se puede clasificar, usa Compleja; si no es contenido del artículo, usa Ruido.",
];

export const CASOS_LIMITE = [
  {
    titulo: "Quitar o sustituir (B o C)",
    texto: "Si puedes quitar el elemento y la oración sigue nombrando lo mismo, es B. Si tienes que reemplazarlo por otra palabra para que la oración funcione, es C.",
  },
  {
    titulo: "Citas directas, también de columnistas",
    texto: "El vocabulario evaluativo entre comillas con atribución es de la fuente, no del medio. Se anota como A·declaración. Aplica igual a funcionarios, voceros, abogados y columnistas citados.",
  },
  {
    titulo: "Verbos de atribución",
    texto: "«Dijo», «explicó», «señaló» no se anotan aparte: van dentro del elemento A·declaración. Solo se separa el verbo cuando evalúa («celebró», «reconoció», «advirtió» en ciertos contextos).",
  },
  {
    titulo: "No hipersegmentes",
    texto: "Un elemento es la unidad mínima con función propia. Varios hechos de la misma fuente y del mismo tipo van juntos en un solo elemento. La pregunta de control: ¿qué información nueva agrega este elemento separado?",
  },
  {
    titulo: "Cifra o declaración",
    texto: "Si el periodista da el número en su propia voz, es A·cifra. Si el número está atribuido a una fuente («según Banxico…»), es A·declaración.",
  },
  {
    titulo: "Aproximadores técnicos",
    texto: "«Cerca de», «aproximadamente» y «alrededor de» son práctica periodística estándar para cifras redondeadas. No se anotan.",
  },
  {
    titulo: "Jerga institucional de seguridad",
    texto: "No es C automáticamente. Pregúntate si un medio de orientación opuesta usaría la misma palabra para lo mismo: si sí, es A («célula delictiva», «cobro de piso»); si usaría otra, es C·léxico («generadores de violencia»).",
  },
  {
    titulo: "Descripción de imágenes o videos",
    texto: "La interpretación de contenido visual es C·encuadre: el periodista describe lo que ve y esa descripción es su interpretación.",
  },
  {
    titulo: "Compleja o Ruido",
    texto: "Compleja: es contenido real del artículo pero demasiado ambiguo para clasificarlo limpiamente. Ruido: no es contenido analizable (encabezados, pies de foto, enlaces de navegación, frases sueltas).",
  },
  {
    titulo: "Cuando dudes",
    texto: "No hay respuestas perfectas. Elige la que mejor defiendas, documenta la duda en las notas y baja la confianza. La consistencia entre anotadores importa más que la exactitud individual.",
  },
];
