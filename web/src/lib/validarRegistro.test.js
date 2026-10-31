import test from "node:test";
import assert from "node:assert/strict";
import { validarRegistro } from "./validarRegistro.js";

const valido = {
  nombre_completo: "Ana López Pérez",
  email: "ana@mail.com",
  celular: "492 123 4567",
  password: "contraseña1",
  confirmacion: "contraseña1",
};

test("acepta datos válidos", () => {
  assert.deepEqual(validarRegistro(valido), []);
});

test("acepta celular con prefijo +52", () => {
  assert.deepEqual(validarRegistro({ ...valido, celular: "+52 492-123-4567" }), []);
});

test("reporta todos los errores a la vez", () => {
  const e = validarRegistro({ nombre_completo: "", email: "x", celular: "1", password: "1", confirmacion: "2" });
  assert.equal(e.length, 5);
});

test("rechaza contraseñas que no coinciden", () => {
  const e = validarRegistro({ ...valido, confirmacion: "otra" });
  assert.equal(e.length, 1);
  assert.match(e[0], /coinciden/);
});
