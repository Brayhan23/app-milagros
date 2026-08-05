const bcrypt = require('bcrypt');
const usuariosRepo = require('../data/usuariosRepo');

const MAX_INTENTOS_FALLIDOS = 5;
const DURACION_BLOQUEO_MS = 5 * 60 * 1000; // 5 minutos

// Estado de intentos en memoria: usuario -> { intentos, bloqueadoHasta }
const intentosPorUsuario = new Map();

function estaBloqueado(usuario) {
  const estado = intentosPorUsuario.get(usuario);
  if (!estado || !estado.bloqueadoHasta) return false;
  return estado.bloqueadoHasta > Date.now();
}

function registrarIntentoFallido(usuario) {
  const estado = intentosPorUsuario.get(usuario) || { intentos: 0, bloqueadoHasta: null };
  estado.intentos += 1;
  if (estado.intentos >= MAX_INTENTOS_FALLIDOS) {
    estado.bloqueadoHasta = Date.now() + DURACION_BLOQUEO_MS;
    estado.intentos = 0;
  }
  intentosPorUsuario.set(usuario, estado);
}

function limpiarIntentos(usuario) {
  intentosPorUsuario.delete(usuario);
}

function login(usuario, password) {
  if (estaBloqueado(usuario)) {
    const { bloqueadoHasta } = intentosPorUsuario.get(usuario);
    const segundosRestantes = Math.ceil((bloqueadoHasta - Date.now()) / 1000);
    return {
      exito: false,
      error: 'bloqueado',
      mensaje: `Cuenta bloqueada temporalmente por intentos fallidos. Intenta de nuevo en ${segundosRestantes} segundos.`,
    };
  }

  const registro = usuariosRepo.buscarPorUsuario(usuario);
  const passwordValida = registro ? bcrypt.compareSync(password, registro.password_hash) : false;

  if (!registro || !passwordValida) {
    registrarIntentoFallido(usuario);
    return {
      exito: false,
      error: 'credenciales_invalidas',
      mensaje: 'Usuario o contraseña incorrectos.',
    };
  }

  limpiarIntentos(usuario);
  return {
    exito: true,
    usuario: { id: registro.id, usuario: registro.usuario },
  };
}

module.exports = { login };
