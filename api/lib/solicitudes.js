// lib/solicitudes.js — Alta de solicitudes de registro.
//
// `db` es cualquier objeto con .query (un Pool o un client de pg).

// Crea una solicitud pendiente para el email (que ya viene en minúsculas y
// es el `usuario` de login). Reglas, sin revelar nunca cuál se aplicó:
//   - email nuevo            → se crea la solicitud (pendiente).
//   - ya hay una pendiente   → no se hace nada (no se sobrescribe).
//   - ya hay una aprobada    → no se hace nada.
//   - ya hay una rechazada   → se reemplaza por la nueva y vuelve a pendiente.
//     Sin esto, el dueño real de un correo que alguien más usó para
//     registrarse (y que el admin rechazó) quedaría bloqueado para siempre.
async function crearSolicitud(db, { nombre_completo, email, celular, hash }) {
  try {
    await db.query(
      `INSERT INTO usuarios (usuario, password_hash, rol, nombre_completo, email, celular, estado)
       VALUES ($1, $2, 'anotador', $3, $1, $4, 'pendiente')
       ON CONFLICT (usuario) DO UPDATE SET
         password_hash   = EXCLUDED.password_hash,
         nombre_completo = EXCLUDED.nombre_completo,
         email           = EXCLUDED.email,
         celular         = EXCLUDED.celular,
         estado          = 'pendiente',
         revisado_por    = NULL,
         revisado_en     = NULL,
         motivo_rechazo  = NULL,
         creado_en       = now()
       WHERE usuarios.estado = 'rechazado' AND usuarios.nombre_completo IS NOT NULL`,
      [email, hash, nombre_completo, celular]
    );
  } catch (err) {
    // 23505: el email choca con OTRA cuenta (p. ej. una creada a mano con
    // ese mismo email). Se trata igual que un duplicado: no se crea nada.
    if (err.code !== "23505") throw err;
  }
}

module.exports = { crearSolicitud };
