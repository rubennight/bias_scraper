const test = require("node:test");
const assert = require("node:assert/strict");
const { validarAnotacion } = require("./validar-anotacion");

const el = (extra = {}) => ({ elemento: "vándalos", alternativa: "manifestantes", tipo: "C", subtipo: "lexical", ...extra });

test("A sin elementos es válida", () => {
  assert.deepEqual(validarAnotacion("A", []), []);
});

test("sin categoría falla", () => {
  assert.equal(validarAnotacion(null, []).length, 1);
});

test("categoría fuera de A/B/C falla", () => {
  assert.equal(validarAnotacion("D", []).length, 1);
});

test("B sin elementos falla", () => {
  assert.equal(validarAnotacion("B", []).length, 1);
});

test("C con elemento sin alternativa falla", () => {
  const e = validarAnotacion("C", [el({ alternativa: "  " })]);
  assert.equal(e.length, 1);
  assert.match(e[0], /alternativa/i);
});

test("elemento con texto y sin subtipo falla", () => {
  const e = validarAnotacion("A", [{ elemento: "firmó el decreto", alternativa: "", tipo: "A", subtipo: "" }]);
  assert.equal(e.length, 1);
  assert.match(e[0], /subtipo/i);
});

test("elementos vacíos se ignoran", () => {
  assert.deepEqual(validarAnotacion("A", [{ elemento: "  ", alternativa: "", tipo: "A", subtipo: "" }]), []);
});

test("B completo es válido", () => {
  assert.deepEqual(validarAnotacion("B", [el({ tipo: "B" })]), []);
});

test("un elemento tipo A dentro de una anotación C no exige alternativa", () => {
  const mixto = [
    el(),
    { elemento: "firmó el decreto", alternativa: "", tipo: "A", subtipo: "accion" },
  ];
  assert.deepEqual(validarAnotacion("C", mixto), []);
});

test("C con solo elementos de tipo A falla: falta el elemento de sesgo con su alternativa", () => {
  const soloA = [{ elemento: "firmó el decreto", alternativa: "", tipo: "A", subtipo: "accion" }];
  const e = validarAnotacion("C", soloA);
  assert.equal(e.length, 1);
  assert.match(e[0], /alternativa/i);
});
