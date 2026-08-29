'use strict';

// IMPORTANTE (seguridad): recuperación de contraseña — código de un solo
// uso, que expira, y con límite de intentos. Nunca toca SMTP real: el envío
// de correo se mockea con el mecanismo nativo de node:test (t.mock.method).
const { crearBaseDeDatosTemporal } = require('./helpers/dbTemporal');
const bd = crearBaseDeDatosTemporal('milagros-test-recuperacion-');

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');

const usuariosRepo = require('../src/data/usuariosRepo');
const emailService = require('../src/domain/emailService');
const recuperacionService = require('../src/domain/recuperacionService');

after(() => bd.limpiar());

function crearUsuarioConCorreo(usuario, correo) {
  const passwordHash = bcrypt.hashSync('ClaveOriginal123', 10);
  const registro = usuariosRepo.crearUsuario({ usuario, passwordHash });
  usuariosRepo.actualizarCorreo(registro.id, correo);
  return registro;
}

// Reemplaza emailService.enviarCorreo por un mock que nunca toca SMTP real
// y devuelve el código de 6 dígitos que se le habría enviado a la usuaria,
// extraído del HTML capturado — así la prueba puede "leer el correo" sin
// que exista ningún correo real.
async function solicitarYCapturarCodigo(t, usuario) {
  const mockEnviar = t.mock.method(emailService, 'enviarCorreo', async () => ({ exito: true }));

  const resultado = await recuperacionService.solicitarRecuperacion(usuario);
  assert.equal(resultado.exito, true, 'fixture: solicitar el código no debería fallar');

  const llamada = mockEnviar.mock.calls[0];
  assert.ok(llamada, 'fixture: se esperaba que se intentara enviar un correo (mockeado)');
  const html = llamada.arguments[0].html;
  const match = html.match(/(\d{6})/);
  assert.ok(match, 'fixture: no se pudo extraer el código de 6 dígitos del correo capturado');
  return match[1];
}

describe('Solicitud de código', () => {
  test('solicitar recuperación nunca abre una conexión SMTP real (queda mockeada) y genera un código de 6 dígitos', async (t) => {
    crearUsuarioConCorreo('recup1', 'recup1@ejemplo.com');
    const codigo = await solicitarYCapturarCodigo(t, 'recup1');
    assert.match(codigo, /^\d{6}$/);
  });
});

describe('Un solo uso', () => {
  test('un código correcto cambia la contraseña, y usarlo una segunda vez ya no funciona', async (t) => {
    crearUsuarioConCorreo('recup2', 'recup2@ejemplo.com');
    const codigo = await solicitarYCapturarCodigo(t, 'recup2');

    const primerUso = recuperacionService.confirmarRecuperacion({
      usuario: 'recup2',
      codigo,
      nuevaPassword: 'ClaveNueva456',
    });
    assert.equal(primerUso.exito, true);

    const segundoUso = recuperacionService.confirmarRecuperacion({
      usuario: 'recup2',
      codigo,
      nuevaPassword: 'OtraClaveMas789',
    });
    assert.equal(segundoUso.exito, false);
    assert.equal(segundoUso.error, 'codigo_invalido');
  });

  test('validarCodigo (paso 2 del frontend) NO consume el código: confirmar después con el mismo código sigue funcionando', async (t) => {
    crearUsuarioConCorreo('recup3', 'recup3@ejemplo.com');
    const codigo = await solicitarYCapturarCodigo(t, 'recup3');

    const validacion = recuperacionService.validarCodigo('recup3', codigo);
    assert.equal(validacion.exito, true);

    const confirmacion = recuperacionService.confirmarRecuperacion({
      usuario: 'recup3',
      codigo,
      nuevaPassword: 'ClaveNueva456',
    });
    assert.equal(confirmacion.exito, true, 'el código sigue siendo válido después de solo validarlo');
  });
});

describe('Expiración', () => {
  test('un código usado después de vencido (10 minutos) se rechaza', async (t) => {
    crearUsuarioConCorreo('recup4', 'recup4@ejemplo.com');
    const codigo = await solicitarYCapturarCodigo(t, 'recup4');

    // Adelanta el reloj del proceso 11 minutos sin esperar de verdad: el
    // código vive en memoria con un expiraEn = Date.now() + 10min calculado
    // en el momento de solicitarlo, así que mover Date.now() hacia adelante
    // simula el paso del tiempo real sin que la prueba tarde 11 minutos.
    // now: Date.now() es imprescindible: sin esa opción, enable() arranca
    // el reloj simulado en el epoch (1970), no en el instante real actual.
    t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
    t.mock.timers.tick(11 * 60 * 1000);

    const resultado = recuperacionService.confirmarRecuperacion({
      usuario: 'recup4',
      codigo,
      nuevaPassword: 'ClaveNueva456',
    });

    assert.equal(resultado.exito, false);
    assert.equal(resultado.error, 'codigo_invalido');
  });

  test('el mismo código, usado ANTES de los 10 minutos, sigue siendo válido', async (t) => {
    crearUsuarioConCorreo('recup5', 'recup5@ejemplo.com');
    const codigo = await solicitarYCapturarCodigo(t, 'recup5');

    t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
    t.mock.timers.tick(9 * 60 * 1000); // 9 minutos: todavía dentro de la ventana de 10

    const resultado = recuperacionService.confirmarRecuperacion({
      usuario: 'recup5',
      codigo,
      nuevaPassword: 'ClaveNueva456',
    });

    assert.equal(resultado.exito, true);
  });
});

describe('Límite de intentos', () => {
  test('5 intentos con código incorrecto agotan el intento, y después el código CORRECTO también se rechaza', async (t) => {
    crearUsuarioConCorreo('recup6', 'recup6@ejemplo.com');
    const codigo = await solicitarYCapturarCodigo(t, 'recup6');

    for (let i = 0; i < 5; i++) {
      const fallo = recuperacionService.validarCodigo('recup6', '000000');
      assert.equal(fallo.exito, false, `intento fallido ${i + 1} debería rechazarse`);
    }

    // El límite es compartido entre validarCodigo y confirmarRecuperacion
    // (mismo contador en el servidor) — por eso incluso el código correcto,
    // usado en confirmarRecuperacion, debe quedar bloqueado acá.
    const conCodigoCorrecto = recuperacionService.confirmarRecuperacion({
      usuario: 'recup6',
      codigo,
      nuevaPassword: 'ClaveNueva456',
    });
    assert.equal(conCodigoCorrecto.exito, false);
    assert.equal(conCodigoCorrecto.error, 'codigo_invalido');
  });

  test('el límite de intentos es compartido entre validarCodigo y confirmarRecuperacion (no es una segunda vía sin límite)', async (t) => {
    crearUsuarioConCorreo('recup7', 'recup7@ejemplo.com');
    const codigo = await solicitarYCapturarCodigo(t, 'recup7');

    // 3 intentos fallidos por validarCodigo + 2 por confirmarRecuperacion = 5 en total.
    recuperacionService.validarCodigo('recup7', '111111');
    recuperacionService.validarCodigo('recup7', '111111');
    recuperacionService.validarCodigo('recup7', '111111');
    recuperacionService.confirmarRecuperacion({ usuario: 'recup7', codigo: '111111', nuevaPassword: 'ClaveNueva456' });
    recuperacionService.confirmarRecuperacion({ usuario: 'recup7', codigo: '111111', nuevaPassword: 'ClaveNueva456' });

    const resultado = recuperacionService.validarCodigo('recup7', codigo);
    assert.equal(resultado.exito, false, 'el código correcto ya no debería aceptarse: se agotaron los 5 intentos combinados');
  });
});
