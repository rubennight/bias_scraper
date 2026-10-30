// Ejemplos de oraciones con elementos de varios tipos (anotaciones mixtas)
// y de cómo se elige la categoría dominante. Son ilustrativos (mock-up),
// escritos a partir de las reglas de docs/agente_anotacion_abc.md.
//
// Regla común: la dominante la elige quien anota viendo la oración
// COMPLETA, no contando elementos. Un solo elemento C puede dominar una
// oración con varios A si orienta toda la lectura.
//
// La combinación de tipos (A + B, A + C…) no se escribe a mano: la interfaz
// la calcula a partir de los elementos.
//
// elementos[].t   fragmento del texto (se resalta)
// elementos[].alt alternativa neutral (solo en elementos B y C)

export const EJEMPLOS_MIXTOS = [
  {
    texto: "El gobernador firmó el decreto el martes 29 de abril, un acto sin mayor trascendencia.",
    elementos: [
      { t: "firmó el decreto el martes 29 de abril", tipo: "A", subtipo: "accion" },
      { t: "un acto sin mayor trascendencia", tipo: "B", subtipo: "lexical", alt: "se elimina" },
    ],
    dominante: "A",
    porque: "El contenido de la oración es la acción datable. La evaluación es accesoria: si se quita, el hecho queda igual.",
  },
  {
    texto: "Fue, sin duda, la peor decisión de la semana, tomada a toda prisa en la reunión del martes.",
    elementos: [
      { t: "reunión del martes", tipo: "A", subtipo: "accion" },
      { t: "sin duda", tipo: "B", subtipo: "epistemico", alt: "se elimina" },
      { t: "la peor decisión de la semana", tipo: "B", subtipo: "lexical", alt: "se elimina" },
      { t: "a toda prisa", tipo: "B", subtipo: "lexical", alt: "se elimina" },
    ],
    dominante: "B",
    porque: "Casi toda la oración es juicio del periodista. El único hecho verificable es que hubo una reunión el martes.",
  },
  {
    texto: "El gobernador celebró que se aplicaron 12 mil dosis el martes, según la Secretaría de Salud.",
    elementos: [
      { t: "celebró", tipo: "B", subtipo: "lexical", alt: "informó" },
      { t: "que se aplicaron 12 mil dosis el martes, según la Secretaría de Salud", tipo: "A", subtipo: "declaracion" },
    ],
    dominante: "A",
    porque: "Un verbo de atribución neutro (dijo, informó) no se anota aparte; aquí «celebró» sí, porque el verbo mismo evalúa. Aun así, lo que sostiene la oración es la declaración verificable.",
  },
  {
    texto: "Kelly dijo que «reequilibraremos la relación» y calificó de «regalo envenenado» el acuerdo anterior.",
    elementos: [
      { t: "Kelly dijo que «reequilibraremos la relación» y calificó de «regalo envenenado» el acuerdo anterior", tipo: "A", subtipo: "declaracion" },
    ],
    dominante: "A",
    porque: "El vocabulario cargado entre comillas con atribución es de la fuente, no del medio. El hecho verificable es que Kelly lo dijo. Anótalo como un solo elemento A·declaración y deja una nota si quieres señalar la carga de las palabras.",
  },
  {
    texto: "Para Marco Oviedo, estratega sénior de XP Investments, el repunte de la inversión manufacturera es una de las señales más positivas del reporte.",
    elementos: [
      { t: "Marco Oviedo, estratega sénior de XP Investments", tipo: "A", subtipo: "declaracion" },
      { t: "repunte", tipo: "C", subtipo: "lexical", alt: "aumento, incremento" },
      { t: "señales más positivas", tipo: "B", subtipo: "lexical", alt: "se elimina" },
    ],
    dominante: "C",
    porque: "«Repunte» lo eligió el periodista en la cláusula que introduce la declaración, no la fuente. Esa elección de palabra orienta la lectura de toda la oración.",
  },
  {
    texto: "La Fiscalía detuvo a 12 personas en Fresnillo el jueves y aseguró tres armas, mientras el régimen presume resultados que nadie ve.",
    elementos: [
      { t: "detuvo a 12 personas en Fresnillo el jueves", tipo: "A", subtipo: "accion" },
      { t: "aseguró tres armas", tipo: "A", subtipo: "cifra" },
      { t: "el régimen", tipo: "C", subtipo: "lexical", alt: "el gobierno" },
      { t: "presume resultados que nadie ve", tipo: "B", subtipo: "epistemico", alt: "se elimina o se atribuye a una fuente" },
    ],
    dominante: "C",
    porque: "Hay dos elementos A y uno solo de sesgo, pero «el régimen» y la cláusula final orientan toda la lectura. La dominante no se decide por conteo.",
  },
  {
    texto: "Los vándalos tomaron la plaza en una jornada lamentable.",
    elementos: [
      { t: "tomaron la plaza", tipo: "A", subtipo: "accion" },
      { t: "vándalos", tipo: "C", subtipo: "lexical", alt: "manifestantes" },
      { t: "lamentable", tipo: "B", subtipo: "lexical", alt: "se elimina" },
    ],
    dominante: "C",
    porque: "«Lamentable» se puede quitar sin perder nada (B). «Vándalos» no: hay que sustituirlo por otra palabra para nombrar lo mismo (C), y revela la postura del medio. Cuando hay un C que orienta la lectura, suele ser la dominante.",
  },
  {
    texto: "Fue una semana pésima, agotadora y llena de malas noticias para los inversionistas, entre ellas la caída de la bolsa tras la guerra comercial.",
    elementos: [
      { t: "pésima, agotadora y llena de malas noticias", tipo: "B", subtipo: "lexical", alt: "se elimina" },
      { t: "la caída de la bolsa", tipo: "A", subtipo: "accion" },
      { t: "guerra comercial", tipo: "C", subtipo: "lexical", alt: "disputa arancelaria" },
    ],
    dominante: "B",
    porque: "La oración es sobre todo evaluación. «Guerra comercial» es un C real pero secundario, en una cláusula subordinada. Si dudas entre B y C, elige una y explica la duda en las notas, y baja la confianza.",
  },
  {
    texto: "Aunque hoy vive tras las «murallas» del régimen obradorista, el plazo legal de la extradición y la nueva política antiterrorista de EU sugieren que el status quo tiene fecha de caducidad, concluye Riva Palacio.",
    elementos: [
      { t: "plazo legal de la extradición", tipo: "A", subtipo: "legal" },
      { t: "concluye Riva Palacio", tipo: "A", subtipo: "declaracion" },
      { t: "fecha de caducidad", tipo: "B", subtipo: "metafora", alt: "se elimina" },
      { t: "murallas", tipo: "C", subtipo: "metafora", alt: "la protección del gobierno" },
      { t: "régimen obradorista", tipo: "C", subtipo: "lexical", alt: "gobierno federal" },
    ],
    dominante: "C",
    porque: "Hay elementos de los tres tipos. Los dos C («murallas» y «régimen obradorista») orientan toda la lectura ideológica, aunque haya dos A. Se elige mirando la oración completa.",
  },
];
