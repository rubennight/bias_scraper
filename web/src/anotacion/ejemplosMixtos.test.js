import test from "node:test";
import assert from "node:assert/strict";
import { EJEMPLOS_MIXTOS } from "./ejemplosMixtos.js";
import { GUIA_CAMPOS, CASOS_LIMITE, PASOS, REGLA_DOMINANTE } from "./guiaCampos.js";

const SUBTIPOS_A  = ["accion", "declaracion", "cifra", "historico", "legal"];
const SUBTIPOS_BC = ["lexical", "metafora", "epistemico", "omision", "encuadre"];

test("cada fragmento resaltado aparece literalmente en la oración", () => {
  for (const ej of EJEMPLOS_MIXTOS) {
    for (const el of ej.elementos) {
      assert.ok(ej.texto.includes(el.t), `«${el.t}» no está en «${ej.texto}»`);
    }
  }
});

test("los subtipos son válidos para el tipo de cada elemento", () => {
  for (const ej of EJEMPLOS_MIXTOS) {
    for (const el of ej.elementos) {
      const validos = el.tipo === "A" ? SUBTIPOS_A : SUBTIPOS_BC;
      assert.ok(validos.includes(el.subtipo), `${el.tipo}·${el.subtipo} en «${el.t}»`);
    }
  }
});

test("todo elemento B o C trae su alternativa neutral", () => {
  for (const ej of EJEMPLOS_MIXTOS) {
    for (const el of ej.elementos.filter(e => e.tipo !== "A")) {
      assert.ok(el.alt && el.alt.trim(), `«${el.t}» sin alternativa`);
    }
  }
});

test("la dominante es A, B o C y cada ejemplo explica por qué", () => {
  for (const ej of EJEMPLOS_MIXTOS) {
    assert.ok(["A", "B", "C"].includes(ej.dominante));
    assert.ok(ej.porque.length > 30);
  }
});

test("hay ejemplos donde cada categoría es la dominante", () => {
  const dominantes = new Set(EJEMPLOS_MIXTOS.map(e => e.dominante));
  assert.deepEqual([...dominantes].sort(), ["A", "B", "C"]);
});

test("se cubren los pares A+B, A+C y B+C y también los tres tipos juntos", () => {
  const tipos = EJEMPLOS_MIXTOS.map(e => new Set(e.elementos.map(x => x.tipo)));
  const tiene = (...ts) => tipos.some(s => ts.every(t => s.has(t)));
  assert.ok(tiene("A", "B"), "falta un ejemplo con A y B");
  assert.ok(tiene("A", "C"), "falta un ejemplo con A y C");
  assert.ok(tiene("B", "C"), "falta un ejemplo con B y C");
  assert.ok(tipos.some(s => s.size === 3), "falta un ejemplo con A, B y C");
});

test("hay un ejemplo donde el único elemento es una declaración con comillas (carga de la fuente)", () => {
  assert.ok(EJEMPLOS_MIXTOS.some(e => e.elementos.length === 1 && e.elementos[0].subtipo === "declaracion" && e.dominante === "A"));
});

test("hay un caso donde un solo C domina sobre varios A", () => {
  const caso = EJEMPLOS_MIXTOS.find(e =>
    e.dominante === "C" &&
    e.elementos.filter(x => x.tipo === "C").length === 1 &&
    e.elementos.filter(x => x.tipo === "A").length >= 2);
  assert.ok(caso);
});

test("la guía lista qué es obligatorio y qué opcional con estados válidos", () => {
  assert.ok(GUIA_CAMPOS.every(c => ["Obligatorio", "Recomendado", "Opcional"].includes(c.estado)));
  assert.ok(GUIA_CAMPOS.some(c => c.estado === "Obligatorio"));
  assert.ok(GUIA_CAMPOS.some(c => c.estado === "Opcional"));
  assert.ok(PASOS.length >= 5);
  assert.ok(CASOS_LIMITE.every(c => c.titulo && c.texto));
  assert.match(REGLA_DOMINANTE, /no contando elementos/);
});
