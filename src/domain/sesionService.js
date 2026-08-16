const crypto = require('crypto');

const DURACION_SESION_MS = 12 * 60 * 60 * 1000; // 12 horas

// token -> { usuarioId, usuario, expiraEn }
const sesiones = new Map();

function limpiarSesionesExpiradas() {
  const ahora = Date.now();
  for (const [token, sesion] of sesiones) {
    if (sesion.expiraEn <= ahora) {
      sesiones.delete(token);
    }
  }
}

function crearSesion(usuario) {
  limpiarSesionesExpiradas();

  const token = crypto.randomUUID();
  sesiones.set(token, {
    usuarioId: usuario.id,
    usuario: usuario.usuario,
    expiraEn: Date.now() + DURACION_SESION_MS,
  });

  return token;
}

function validarToken(token) {
  if (!token) return null;

  const sesion = sesiones.get(token);
  if (!sesion) return null;

  if (sesion.expiraEn <= Date.now()) {
    sesiones.delete(token);
    return null;
  }

  return { id: sesion.usuarioId, usuario: sesion.usuario };
}

module.exports = { crearSesion, validarToken };
