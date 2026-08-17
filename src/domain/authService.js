const bcrypt = require('bcrypt');
const usuariosRepo = require('../data/usuariosRepo');
const auditoriaService = require('./auditoriaService');
const { ACCIONES } = auditoriaService;

const MAX_INTENTOS_FALLIDOS = 5;
const DURACION_BLOQUEO_MS = 5 * 60 * 1000; // 5 minutos

// Hash "señuelo" fijo, generado una sola vez al cargar el módulo. Cuando el
// usuario NO existe, se compara la contraseña recibida contra ESTE hash en
// vez de saltarse bcrypt directamente — así ese camino consume un tiempo de
// CPU similar al de comparar contra un hash real, y el tiempo de respuesta
// deja de delatar si el usuario existe o no (timing side-channel: antes,
// un usuario inexistente respondía casi instantáneo porque bcrypt.compareSync
// solo corría cuando `registro` existía). El resultado de esta comparación
// nunca importa: más abajo, `!registro` ya alcanza para rechazar el login.
const HASH_SEÑUELO = bcrypt.hashSync('contraseña-señuelo-nunca-es-real', 12);

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

// ip es opcional (el caller la pasa cuando la tiene, ej. req.ip en
// authRoutes.js): se registra en auditoría porque el login, exitoso o
// fallido, es el evento donde más importa poder distinguir un acceso
// legítimo de uno indebido. Nunca se audita la contraseña, solo el
// resultado (éxito/fallo) y quién lo intentó.
function login(usuario, password, ip = null) {
  if (estaBloqueado(usuario)) {
    const { bloqueadoHasta } = intentosPorUsuario.get(usuario);
    const segundosRestantes = Math.ceil((bloqueadoHasta - Date.now()) / 1000);
    auditoriaService.registrar({
      usuario,
      accion: ACCIONES.LOGIN_FALLIDO,
      entidad: 'usuario',
      detalle: `Intento de login para "${usuario}" rechazado: cuenta bloqueada temporalmente.`,
      ip,
    });
    return {
      exito: false,
      error: 'bloqueado',
      mensaje: `Cuenta bloqueada temporalmente por intentos fallidos. Intenta de nuevo en ${segundosRestantes} segundos.`,
    };
  }

  const registro = usuariosRepo.buscarPorUsuario(usuario);
  const passwordValida = bcrypt.compareSync(password, registro ? registro.password_hash : HASH_SEÑUELO);

  if (!registro || !passwordValida) {
    registrarIntentoFallido(usuario);
    auditoriaService.registrar({
      usuario,
      accion: ACCIONES.LOGIN_FALLIDO,
      entidad: 'usuario',
      entidadId: registro ? registro.id : null,
      detalle: `Intento de login fallido para "${usuario}".`,
      ip,
    });
    return {
      exito: false,
      error: 'credenciales_invalidas',
      mensaje: 'Usuario o contraseña incorrectos.',
    };
  }

  limpiarIntentos(usuario);
  auditoriaService.registrar({
    usuario: { id: registro.id, usuario: registro.usuario },
    accion: ACCIONES.LOGIN_EXITOSO,
    entidad: 'usuario',
    entidadId: registro.id,
    detalle: `Inicio de sesión exitoso para "${registro.usuario}".`,
    ip,
  });
  return {
    exito: true,
    usuario: { id: registro.id, usuario: registro.usuario },
  };
}

// Expuesto para recuperacionService: tras un reseteo de contraseña exitoso
// (la usuaria ya probó su identidad con el código enviado por correo), un
// bloqueo por intentos fallidos previos a ese reseteo no debe seguir
// vigente — si no se limpia acá, login() lo sigue rechazando durante los
// próximos 5 minutos SIN IMPORTAR qué contraseña se use, ni la vieja ni la
// nueva, porque estaBloqueado() se revisa antes de comparar la contraseña.
module.exports = { login, limpiarBloqueoLogin: limpiarIntentos };
