const test = require("node:test");
const assert = require("node:assert/strict");
const { validarRegistro } = require("./registro");

const valido = {
  nombre_completo: "Ana López Pérez",
  email: "ana@mail.com",
  celular: "4921234567",
  password: "contraseña1",
};

test("acepta datos válidos y normaliza email y celular", () => {
  const r = validarRegistro({
    ...valido,
    nombre_completo: "  Ana López Pérez ",
    email: " Ana@Mail.COM ",
    celular: "+52 492-123-4567",
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.datos, {
    nombre_completo: "Ana López Pérez",
    email: "ana@mail.com",
    celular: "4921234567",
  });
});

test("rechaza nombre corto", () => {
  const r = validarRegistro({ ...valido, nombre_completo: "Al" });
  assert.equal(r.ok, false);
  assert.equal(r.errores.length, 1);
});

test("rechaza email sin arroba", () => {
  const r = validarRegistro({ ...valido, email: "ana.mail.com" });
  assert.equal(r.ok, false);
});

test("rechaza celular de 9 dígitos", () => {
  const r = validarRegistro({ ...valido, celular: "492123456" });
  assert.equal(r.ok, false);
});

test("rechaza contraseña de 7 caracteres", () => {
  const r = validarRegistro({ ...valido, password: "1234567" });
  assert.equal(r.ok, false);
});

test("reporta todos los errores a la vez", () => {
  const r = validarRegistro({ nombre_completo: "", email: "x", celular: "1", password: "1" });
  assert.equal(r.ok, false);
  assert.equal(r.errores.length, 4);
});

test("no revienta con campos ausentes", () => {
  const r = validarRegistro({});
  assert.equal(r.ok, false);
  assert.equal(r.errores.length, 4);
});
