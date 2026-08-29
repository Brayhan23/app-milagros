'use strict';

// CRÍTICO: abonos sobre ventas a crédito. Plata real entrando a caja — un
// error acá significa cobrarle de más o de menos a un cliente, o dejar una
// deuda mal calculada.
const { crearBaseDeDatosTemporal } = require('./helpers/dbTemporal');
const bd = crearBaseDeDatosTemporal('milagros-test-creditos-');

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');

const ventasService = require('../src/domain/ventasService');
const creditoService = require('../src/domain/creditoService');
const { crearProductoDePrueba, crearClienteDePrueba, USUARIO_PRUEBA } = require('./helpers/fixtures');

after(() => bd.limpiar());

function crearVentaACredito(total) {
  const producto = crearProductoDePrueba({ precioDetal: total, stockActual: 10 });
  const cliente = crearClienteDePrueba();
  const resultado = ventasService.crearVenta(
    { tipoCliente: 'detal', metodoPago: 'credito', clienteId: cliente.id, items: [{ productoId: producto.id, cantidad: 1 }] },
    USUARIO_PRUEBA
  );
  assert.equal(resultado.exito, true, 'fixture: la venta a crédito debe crearse sin problema');
  return { venta: resultado.venta, cliente };
}

function crearVentaDeContado(total) {
  const producto = crearProductoDePrueba({ precioDetal: total, stockActual: 10 });
  const resultado = ventasService.crearVenta(
    { tipoCliente: 'detal', metodoPago: 'efectivo', items: [{ productoId: producto.id, cantidad: 1 }] },
    USUARIO_PRUEBA
  );
  assert.equal(resultado.exito, true, 'fixture: la venta de contado debe crearse sin problema');
  return resultado.venta;
}

describe('Validación de abonos', () => {
  test('un abono mayor al saldo pendiente se rechaza', () => {
    const { venta } = crearVentaACredito(50000);

    const resultado = creditoService.registrarAbono({ ventaId: venta.id, monto: 50001 }, USUARIO_PRUEBA);

    assert.equal(resultado.exito, false);
    assert.equal(resultado.error, 'monto_supera_saldo');
  });

  test('un abono de monto cero se rechaza', () => {
    const { venta } = crearVentaACredito(50000);

    const resultado = creditoService.registrarAbono({ ventaId: venta.id, monto: 0 }, USUARIO_PRUEBA);

    assert.equal(resultado.exito, false);
    assert.equal(resultado.error, 'monto_invalido');
  });

  test('un abono de monto negativo se rechaza', () => {
    const { venta } = crearVentaACredito(50000);

    const resultado = creditoService.registrarAbono({ ventaId: venta.id, monto: -5000 }, USUARIO_PRUEBA);

    assert.equal(resultado.exito, false);
    assert.equal(resultado.error, 'monto_invalido');
  });

  test('un abono sobre una venta que no es a crédito (efectivo) se rechaza', () => {
    const venta = crearVentaDeContado(30000);

    const resultado = creditoService.registrarAbono({ ventaId: venta.id, monto: 10000 }, USUARIO_PRUEBA);

    assert.equal(resultado.exito, false);
    assert.equal(resultado.error, 'venta_no_es_credito');
  });

  test('un abono sobre una venta inexistente se rechaza', () => {
    const resultado = creditoService.registrarAbono({ ventaId: 999999, monto: 1000 }, USUARIO_PRUEBA);

    assert.equal(resultado.exito, false);
    assert.equal(resultado.error, 'no_encontrado');
  });
});

describe('Cálculo del saldo con varios abonos', () => {
  test('el saldo se descuenta correctamente después de un abono parcial', () => {
    const { venta } = crearVentaACredito(100000);

    const resultado = creditoService.registrarAbono({ ventaId: venta.id, monto: 40000 }, USUARIO_PRUEBA);

    assert.equal(resultado.exito, true);
    assert.equal(resultado.saldoRestante, 60000);
  });

  test('varios abonos parciales seguidos dejan el saldo exacto, sin importar el orden de los montos', () => {
    const { venta } = crearVentaACredito(100000);

    const r1 = creditoService.registrarAbono({ ventaId: venta.id, monto: 25000 }, USUARIO_PRUEBA);
    const r2 = creditoService.registrarAbono({ ventaId: venta.id, monto: 33000 }, USUARIO_PRUEBA);
    const r3 = creditoService.registrarAbono({ ventaId: venta.id, monto: 12500 }, USUARIO_PRUEBA);

    assert.equal(r1.saldoRestante, 75000);
    assert.equal(r2.saldoRestante, 42000);
    assert.equal(r3.saldoRestante, 29500);

    const deuda = creditoService.obtenerDeudaCliente(
      require('../src/data/ventasRepo').buscarPorId(venta.id).cliente_id
    );
    const ventaEnDeuda = deuda.ventas.find((v) => v.venta_id === venta.id);
    assert.equal(ventaEnDeuda.abonado, 25000 + 33000 + 12500);
    assert.equal(ventaEnDeuda.saldo, 29500);
  });

  test('un abono exactamente igual al saldo pendiente lo deja en cero, y un abono más ya se rechaza', () => {
    const { venta } = crearVentaACredito(20000);

    const primero = creditoService.registrarAbono({ ventaId: venta.id, monto: 20000 }, USUARIO_PRUEBA);
    assert.equal(primero.exito, true);
    assert.equal(primero.saldoRestante, 0);

    const segundo = creditoService.registrarAbono({ ventaId: venta.id, monto: 1 }, USUARIO_PRUEBA);
    assert.equal(segundo.exito, false);
    assert.equal(segundo.error, 'monto_supera_saldo');
  });
});
