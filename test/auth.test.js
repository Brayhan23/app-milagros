'use strict';

// IMPORTANTE (seguridad): login, bloqueo por intentos fallidos, y que las
// rutas protegidas realmente rechacen sin sesión válida.
const { crearBaseDeDatosTemporal } = require('./helpers/dbTemporal');
const bd = crearBaseDeDatosTemporal('milagros-test-auth-');

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');

const usuariosRepo = require('../src/data/usuariosRepo');
const authService = require('../src/domain/authService');
const sesionService = require('../src/domain/sesionService');
const requiereSesion = require('../src/routes/middlewares/requiereSesion');

after(() => bd.limpiar());

function crearUsuarioDePrueba(usuario, password) {
  const passwordHash = bcrypt.hashSync(password, 10); // 10 rondas alcanza para la prueba, no hace falta el costo de producción
  return usuariosRepo.crearUsuario({ usuario, passwordHash });
}

// Réplica mínima de req/res de Express, suficiente para probar el
// middleware como función aislada sin levantar un servidor HTTP real.
function crearReqFalso(headerAuthorization) {
  return { headers: headerAuthorization ? { authorization: headerAuthorization } : {} };
}

function crearResFalso() {
  const res = { statusCode: null, cuerpo: null };
  res.status = (codigo) => {
    res.statusCode = codigo;
    return res;
  };
  res.json = (payload) => {
    res.cuerpo = payload;
    return res;
  };
  return res;
}

describe('Login', () => {
  test('credenciales correctas: login exitoso y devuelve el usuario', () => {
    crearUsuarioDePrueba('cajera1', 'ClaveSegura123');

    const resultado = authService.login('cajera1', 'ClaveSegura123');

    assert.equal(resultado.exito, true);
    assert.equal(resultado.usuario.usuario, 'cajera1');
  });

  test('credenciales incorrectas: se rechaza con mensaje genérico (no delata si el usuario existe)', () => {
    crearUsuarioDePrueba('cajera2', 'ClaveSegura123');

    const resultado = authService.login('cajera2', 'clave-equivocada');

    assert.equal(resultado.exito, false);
    assert.equal(resultado.error, 'credenciales_invalidas');
    assert.equal(resultado.mensaje, 'Usuario o contraseña incorrectos.');
  });

  test('un usuario que no existe da el mismo error genérico que una contraseña incorrecta', () => {
    const resultado = authService.login('usuario-que-no-existe', 'cualquier-cosa');

    assert.equal(resultado.exito, false);
    assert.equal(resultado.error, 'credenciales_invalidas');
  });

  test('tras 5 intentos fallidos la cuenta queda bloqueada, incluso si el 6.° intento usa la contraseña correcta', () => {
    crearUsuarioDePrueba('cajera3', 'ClaveSegura123');

    for (let i = 0; i < 5; i++) {
      const fallo = authService.login('cajera3', 'clave-mala');
      assert.equal(fallo.exito, false);
      assert.equal(fallo.error, 'credenciales_invalidas', `intento ${i + 1} debería fallar por credenciales, no por bloqueo`);
    }

    const bloqueado = authService.login('cajera3', 'ClaveSegura123');
    assert.equal(bloqueado.exito, false);
    assert.equal(bloqueado.error, 'bloqueado');
  });

  test('el bloqueo es por usuario: una cuenta distinta puede loguearse normalmente aunque otra esté bloqueada', () => {
    crearUsuarioDePrueba('cajera4', 'ClaveSegura123');
    crearUsuarioDePrueba('cajera5', 'OtraClave456');

    for (let i = 0; i < 5; i++) authService.login('cajera4', 'clave-mala');
    assert.equal(authService.login('cajera4', 'ClaveSegura123').exito, false, 'cajera4 debe seguir bloqueada');

    const resultado = authService.login('cajera5', 'OtraClave456');
    assert.equal(resultado.exito, true, 'cajera5 nunca falló, no debería estar afectada por el bloqueo de cajera4');
  });
});

describe('Rutas protegidas (middleware requiereSesion)', () => {
  test('sin encabezado Authorization, se rechaza con 401', () => {
    const req = crearReqFalso(undefined);
    const res = crearResFalso();
    let siguienteLlamado = false;

    requiereSesion(req, res, () => {
      siguienteLlamado = true;
    });

    assert.equal(res.statusCode, 401);
    assert.equal(siguienteLlamado, false, 'next() no debe llamarse si no hay token');
  });

  test('con un token inválido (inventado), se rechaza con 401', () => {
    const req = crearReqFalso('Bearer token-que-nunca-existio');
    const res = crearResFalso();
    let siguienteLlamado = false;

    requiereSesion(req, res, () => {
      siguienteLlamado = true;
    });

    assert.equal(res.statusCode, 401);
    assert.equal(siguienteLlamado, false);
  });

  test('con un token válido, deja pasar la petición y adjunta el usuario a req', () => {
    const token = sesionService.crearSesion({ id: 7, usuario: 'cajera_valida' });
    const req = crearReqFalso(`Bearer ${token}`);
    const res = crearResFalso();
    let siguienteLlamado = false;

    requiereSesion(req, res, () => {
      siguienteLlamado = true;
    });

    assert.equal(siguienteLlamado, true);
    assert.equal(res.statusCode, null, 'no debe haberse llamado a res.status en el camino exitoso');
    assert.deepEqual(req.usuario, { id: 7, usuario: 'cajera_valida' });
  });

  test('logout invalida el token del lado del servidor: el mismo token ya no sirve después', () => {
    const token = sesionService.crearSesion({ id: 8, usuario: 'cajera_logout' });

    // Antes de cerrar sesión, el token funciona.
    const antes = crearResFalso();
    let antesDejoPasar = false;
    requiereSesion(crearReqFalso(`Bearer ${token}`), antes, () => {
      antesDejoPasar = true;
    });
    assert.equal(antesDejoPasar, true);

    // Logout: mismo mecanismo que usa la ruta real (sesionService.eliminarSesion).
    sesionService.eliminarSesion(token);

    // El MISMO token, después de cerrar sesión, ya no debe servir.
    const despues = crearResFalso();
    let despuesDejoPasar = false;
    requiereSesion(crearReqFalso(`Bearer ${token}`), despues, () => {
      despuesDejoPasar = true;
    });
    assert.equal(despuesDejoPasar, false);
    assert.equal(despues.statusCode, 401);
  });
});
