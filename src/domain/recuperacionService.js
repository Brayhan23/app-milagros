const crypto = require('crypto');
const bcrypt = require('bcrypt');
const usuariosRepo = require('../data/usuariosRepo');
const authService = require('./authService');
const emailService = require('./emailService');
const auditoriaService = require('./auditoriaService');
const { ACCIONES } = auditoriaService;

const SALT_ROUNDS = 12;
const DURACION_CODIGO_MS = 10 * 60 * 1000; // 10 minutos
const MAX_INTENTOS_CODIGO = 5;
const LONGITUD_CODIGO = 6;

// Timing side-channel: cuando el usuario no existe (o no tiene correo), este
// camino respondía casi instantáneo porque nunca llega a hacer la conexión
// SMTP real; cuando sí existe, `emailService.enviarCorreo` espera una
// conexión SMTP real (medido en este entorno: ~1.6-2.2s contra Gmail). Esa
// diferencia de tiempo delata si el usuario existe aunque el mensaje de
// respuesta sea idéntico. No hace falta que coincida exacto — alcanza con
// que el camino "corto" ya no sea instantáneo comparado con el real.
const DEMORA_ARTIFICIAL_MS = 1700;

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// El sistema no tenía ninguna regla de longitud mínima de contraseña
// definida (ni en authService/login ni en scripts/crear-admin.js). Se fija
// aquí un mínimo razonable (8 caracteres) solo para ESTE flujo nuevo, sin
// tocar la lógica de login ni la creación de admin ya existentes.
const MIN_LONGITUD_PASSWORD = 8;

// Códigos de recuperación: NUNCA se guardan en la base de datos, solo en
// memoria (mismo patrón que las sesiones de sesionService.js) — son un
// secreto de un solo uso y de vida muy corta (10 minutos), no un dato que
// tenga sentido persistir ni que aparezca en un backup.
// Clave: usuarios.usuario (canónico, resuelto vía resolverUsuario), NUNCA
// el identificador crudo que haya escrito la usuaria (podría ser su
// correo). Valor: { codigo, usuarioId, expiraEn, intentos }.
const codigosPorUsuario = new Map();

function generarCodigo() {
  return String(crypto.randomInt(0, 1000000)).padStart(LONGITUD_CODIGO, '0');
}

// Acepta tanto el nombre de usuario como el correo registrado: la usuaria
// puede no recordar cuál de los dos escribió al pedir el código, así que el
// mismo campo del formulario sirve para ambos y aquí se prueban los dos.
function resolverUsuario(identificador) {
  if (typeof identificador !== 'string' || !identificador.trim()) return null;
  const valor = identificador.trim();
  return usuariosRepo.buscarPorUsuario(valor) || usuariosRepo.buscarPorCorreo(valor) || null;
}

function construirHtmlCodigo(codigo) {
  return `
    <div style="font-family: Arial, sans-serif; color:#2e2e2e; max-width:480px; margin:0 auto;">
      <h2 style="color:#c2185b;">Milagros</h2>
      <p>Recibimos una solicitud para restablecer tu contraseña.</p>
      <p style="font-size:1.6em; letter-spacing:4px; font-weight:bold; color:#c2185b; text-align:center; margin:20px 0;">${codigo}</p>
      <p>Este código vence en 10 minutos y solo puede usarse una vez. Escríbelo en la misma pantalla de inicio de sesión de la aplicación, en el computador de la tienda (el código no funciona desde un enlace ni desde el celular).</p>
      <p style="font-size:0.85em; color:#767676;">Si no solicitaste este cambio, ignora este correo: tu contraseña actual sigue funcionando.</p>
    </div>
  `;
}

// Siempre responde con el mismo mensaje genérico, exista o no el usuario, y
// tenga o no correo configurado: así nadie puede usar este endpoint para
// averiguar qué usuarios están registrados en el sistema. La única
// excepción es un problema de configuración del propio servidor (SMTP no
// configurado): ese error es igual para cualquier identificador que se
// pida, no distingue usuarios reales de inventados, así que no es una
// fuga de información.
async function solicitarRecuperacion(identificador, ip = null) {
  const MENSAJE_GENERICO = 'Si el usuario existe y tiene un correo registrado, recibirás un código en unos minutos.';

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return {
      exito: false,
      error: 'smtp_no_configurado',
      mensaje: 'El envío de correo no está configurado en el servidor. Contacta al administrador.',
    };
  }

  const registro = resolverUsuario(identificador);

  // Se audita el intento tal cual, exista o no el usuario: un patrón de
  // solicitudes para usuarios inventados es justamente lo que este registro
  // debe permitir detectar más adelante. El código en sí NUNCA se audita.
  auditoriaService.registrar({
    usuario: registro ? { id: registro.id, usuario: registro.usuario } : String(identificador),
    accion: ACCIONES.RECUPERACION_SOLICITADA,
    entidad: 'usuario',
    entidadId: registro ? registro.id : null,
    detalle: `Se solicitó recuperación de contraseña para "${identificador}".`,
    ip,
  });

  if (!registro || !registro.correo) {
    // No hay a dónde enviar el código (usuario inexistente o sin correo
    // configurado): no se genera código ninguno, pero la respuesta es
    // idéntica a la del caso exitoso — y ahora también tarda un tiempo
    // similar, para no delatar por timing que este camino se saltó el envío.
    await esperar(DEMORA_ARTIFICIAL_MS);
    return { exito: true, mensaje: MENSAJE_GENERICO };
  }

  const codigo = generarCodigo();

  const resultadoEnvio = await emailService.enviarCorreo({
    destino: registro.correo,
    asunto: 'Milagros — Código de recuperación de contraseña',
    html: construirHtmlCodigo(codigo),
  });

  if (!resultadoEnvio.exito) {
    // Un fallo de envío puntual (red, correo rebotado, etc.) tampoco debe
    // distinguirse del caso "usuario inexistente" de cara al cliente; queda
    // en el log del servidor para que la usuaria/administrador lo investigue.
    console.error('No se pudo enviar el código de recuperación:', resultadoEnvio.mensaje);
    return { exito: true, mensaje: MENSAJE_GENERICO };
  }

  codigosPorUsuario.set(registro.usuario, {
    codigo,
    usuarioId: registro.id,
    expiraEn: Date.now() + DURACION_CODIGO_MS,
    intentos: 0,
  });

  return { exito: true, mensaje: MENSAJE_GENERICO };
}

const MENSAJE_CODIGO_INVALIDO = 'El código es inválido o ya expiró. Solicita uno nuevo.';

// Núcleo compartido entre validarCodigo() (paso 2 del frontend: solo
// confirma que el código escrito es el correcto, antes de mostrar los
// campos de contraseña nueva) y confirmarRecuperacion() (paso 3: el cambio
// real). Las dos comparten el MISMO estado en memoria (codigosPorUsuario) y
// el MISMO contador de intentos: separar la validación en dos llamadas no
// abre una segunda vía para adivinar el código sin límite — cada intento
// fallido, venga de la ruta que venga, sigue sumando al mismo `intentos` y
// dispara el mismo bloqueo a los MAX_INTENTOS_CODIGO de siempre.
//
// A propósito NO borra el estado en un acierto: eso lo decide quien la
// llama (confirmarRecuperacion sí lo consume, porque ya va a cambiar la
// contraseña; validarCodigo lo deja intacto, porque todavía falta el paso
// 3 y el mismo código se vuelve a necesitar ahí).
function verificarCodigo(identificador, codigo) {
  if (typeof codigo !== 'string' || !/^\d{6}$/.test(codigo.trim())) {
    return { exito: false, error: 'codigo_invalido', mensaje: MENSAJE_CODIGO_INVALIDO };
  }

  // Cualquier motivo de rechazo (usuario inexistente, código vencido, código
  // incorrecto) devuelve exactamente el mismo error: no hay forma de
  // distinguir "ese usuario no existe" de "el código está mal" desde afuera.
  const registro = resolverUsuario(identificador);
  if (!registro) {
    return { exito: false, error: 'codigo_invalido', mensaje: MENSAJE_CODIGO_INVALIDO };
  }

  const estado = codigosPorUsuario.get(registro.usuario);
  if (!estado || estado.expiraEn <= Date.now()) {
    codigosPorUsuario.delete(registro.usuario);
    return { exito: false, error: 'codigo_invalido', mensaje: MENSAJE_CODIGO_INVALIDO };
  }

  if (estado.codigo !== codigo.trim()) {
    estado.intentos += 1;
    if (estado.intentos >= MAX_INTENTOS_CODIGO) {
      // Mismo criterio que el bloqueo de authService: agotados los
      // intentos, el código queda inservible aunque después se adivine
      // bien; hay que pedir uno nuevo.
      codigosPorUsuario.delete(registro.usuario);
    }
    return { exito: false, error: 'codigo_invalido', mensaje: MENSAJE_CODIGO_INVALIDO };
  }

  return { exito: true, registro };
}

// Paso 2 del frontend: confirma que el código es válido SIN consumirlo ni
// cambiar nada todavía — así el formulario puede mostrar recién ahí los
// campos de contraseña nueva, con la certeza de que el código ya es
// correcto (y no descubrirlo al final, después de que la usuaria ya
// escribió la contraseña dos veces).
function validarCodigo(identificador, codigo) {
  const resultado = verificarCodigo(identificador, codigo);
  if (!resultado.exito) return { exito: false, error: resultado.error, mensaje: resultado.mensaje };
  return { exito: true };
}

function confirmarRecuperacion({ usuario: identificador, codigo, nuevaPassword } = {}, ip = null) {
  if (typeof nuevaPassword !== 'string' || nuevaPassword.length < MIN_LONGITUD_PASSWORD) {
    return {
      exito: false,
      error: 'password_invalida',
      mensaje: `La nueva contraseña debe tener al menos ${MIN_LONGITUD_PASSWORD} caracteres.`,
    };
  }

  const resultado = verificarCodigo(identificador, codigo);
  if (!resultado.exito) return { exito: false, error: resultado.error, mensaje: resultado.mensaje };
  const { registro } = resultado;

  // Código correcto: se consume de inmediato (un solo uso) antes de tocar
  // la BD, para que un error a mitad de camino nunca deje un código válido
  // reutilizable.
  codigosPorUsuario.delete(registro.usuario);

  const passwordHash = bcrypt.hashSync(nuevaPassword, SALT_ROUNDS);
  usuariosRepo.actualizarPassword(registro.id, passwordHash);

  // Si la usuaria había fallado logins antes de pedir el código (el caso
  // típico: intentó recordar su contraseña varias veces antes de rendirse),
  // ese bloqueo queda vigente en authService y por sí solo NUNCA se limpia
  // con un reseteo exitoso. Sin esta línea, la nueva contraseña queda
  // guardada correctamente pero login() la sigue rechazando por hasta 5
  // minutos, como si el reseteo nunca hubiera pasado.
  authService.limpiarBloqueoLogin(registro.usuario);

  auditoriaService.registrar({
    usuario: { id: registro.id, usuario: registro.usuario },
    accion: ACCIONES.RECUPERACION_COMPLETADA,
    entidad: 'usuario',
    entidadId: registro.id,
    detalle: `Contraseña restablecida mediante código de recuperación para "${registro.usuario}".`,
    ip,
  });

  return { exito: true, mensaje: 'Contraseña actualizada correctamente. Ya puedes iniciar sesión.' };
}

module.exports = { solicitarRecuperacion, validarCodigo, confirmarRecuperacion, MIN_LONGITUD_PASSWORD };
