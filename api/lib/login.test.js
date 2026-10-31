const test = require("node:test");
const assert = require("node:assert/strict");
const { decidirLogin } = require("./login");

const cuenta = estado => ({ id: 1, estado });
const GENERICO = "Usuario o contraseña incorrectos";

test("cuenta pendiente con contraseña incorrecta: mensaje genérico, sin revelar el estado", () => {
  assert.deepEqual(decidirLogin(cuenta("pendiente"), false), { status: 401, error: GENERICO });
});

test("cuenta rechazada con contraseña incorrecta: mensaje genérico, sin revelar el estado", () => {
  assert.deepEqual(decidirLogin(cuenta("rechazado"), false), { status: 401, error: GENERICO });
});

test("usuario inexistente da exactamente el mismo mensaje que contraseña incorrecta", () => {
  assert.deepEqual(decidirLogin(undefined, false), decidirLogin(cuenta("aprobado"), false));
});

test("cuenta pendiente con contraseña correcta: 403 pendiente de aprobación", () => {
  assert.deepEqual(decidirLogin(cuenta("pendiente"), true), { status: 403, error: "Tu cuenta está pendiente de aprobación" });
});

test("cuenta rechazada con contraseña correcta: 403 rechazada", () => {
  assert.deepEqual(decidirLogin(cuenta("rechazado"), true), { status: 403, error: "Tu solicitud fue rechazada" });
});

test("cuenta aprobada con contraseña correcta entra", () => {
  assert.equal(decidirLogin(cuenta("aprobado"), true).status, 200);
});
