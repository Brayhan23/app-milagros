'use strict';

// CRÍTICO: cálculo de ventas, precio detal/mayor, descuentos, overflow,
// ventas a crédito y descuento de stock. Es la plata del negocio — estas
// pruebas verifican que los números SIEMPRE cuadren exacto, no solo "casi".
const { crearBaseDeDatosTemporal } = require('./helpers/dbTemporal');
const bd = crearBaseDeDatosTemporal('milagros-test-ventas-');

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');

const ventasService = require('../src/domain/ventasService');
const productosRepo = require('../src/data/productosRepo');
const { crearProductoDePrueba, crearClienteDePrueba, USUARIO_PRUEBA } = require('./helpers/fixtures');

after(() => bd.limpiar());

describe('Cálculo de venta', () => {
  test('el subtotal, el descuento y el total cuadran exacto para varios items', () => {
    const productoA = crearProductoDePrueba({ precioDetal: 15000, precioMayor: 12000, precioCompra: 8000 });
    const productoB = crearProductoDePrueba({ precioDetal: 7000, precioMayor: 5000, precioCompra: 3000 });

    const resultado = ventasService.crearVenta(
      {
        tipoCliente: 'detal',
        metodoPago: 'efectivo',
        descuento: 5000,
        items: [
          { productoId: productoA.id, cantidad: 3 }, // 3 * 15000 = 45000
          { productoId: productoB.id, cantidad: 2 }, // 2 * 7000 = 14000
        ],
      },
      USUARIO_PRUEBA
    );

    assert.equal(resultado.exito, true);
    const { venta } = resultado;
    assert.equal(venta.subtotal, 59000);
    assert.equal(venta.descuento, 5000);
    assert.equal(venta.total, 54000);
    assert.equal(venta.subtotal - venta.descuento, venta.total, 'subtotal - descuento debe ser exactamente el total');
  });

  test('la base gravable más el IVA suman exactamente el total, para cualquier porcentaje', () => {
    const producto = crearProductoDePrueba({ precioDetal: 13333, precioCompra: 5000 }); // precio "feo" a propósito

    const resultado = ventasService.crearVenta(
      { tipoCliente: 'detal', metodoPago: 'efectivo', items: [{ productoId: producto.id, cantidad: 7 }] },
      USUARIO_PRUEBA
    );

    assert.equal(resultado.exito, true);
    const { venta } = resultado;
    assert.equal(venta.baseGravable + venta.ivaMonto, venta.total, 'baseGravable + ivaMonto debe ser exactamente el total, sin residuos de redondeo');
  });

  test('con tipoCliente "detal" se usa el precio al detal, no el de mayor', () => {
    const producto = crearProductoDePrueba({ precioDetal: 20000, precioMayor: 16000 });

    const resultado = ventasService.crearVenta(
      { tipoCliente: 'detal', metodoPago: 'efectivo', items: [{ productoId: producto.id, cantidad: 1 }] },
      USUARIO_PRUEBA
    );

    assert.equal(resultado.exito, true);
    assert.equal(resultado.venta.subtotal, 20000);
  });

  test('con tipoCliente "mayor" se usa el precio al por mayor, no el de detal', () => {
    const producto = crearProductoDePrueba({ precioDetal: 20000, precioMayor: 16000 });

    const resultado = ventasService.crearVenta(
      { tipoCliente: 'mayor', metodoPago: 'efectivo', items: [{ productoId: producto.id, cantidad: 1 }] },
      USUARIO_PRUEBA
    );

    assert.equal(resultado.exito, true);
    assert.equal(resultado.venta.subtotal, 16000);
  });

  test('un descuento mayor al subtotal se rechaza y no crea la venta', () => {
    const producto = crearProductoDePrueba({ precioDetal: 10000 });
    const stockAntes = productosRepo.buscarPorId(producto.id).stock_actual;

    const resultado = ventasService.crearVenta(
      { tipoCliente: 'detal', metodoPago: 'efectivo', descuento: 10001, items: [{ productoId: producto.id, cantidad: 1 }] },
      USUARIO_PRUEBA
    );

    assert.equal(resultado.exito, false);
    assert.equal(resultado.error, 'descuento_invalido');
    assert.equal(productosRepo.buscarPorId(producto.id).stock_actual, stockAntes, 'el stock no debe tocarse si la venta se rechaza');
  });

  test('un descuento igual al subtotal (venta que da total $0) sí se acepta', () => {
    const producto = crearProductoDePrueba({ precioDetal: 10000 });

    const resultado = ventasService.crearVenta(
      { tipoCliente: 'detal', metodoPago: 'efectivo', descuento: 10000, items: [{ productoId: producto.id, cantidad: 1 }] },
      USUARIO_PRUEBA
    );

    assert.equal(resultado.exito, true);
    assert.equal(resultado.venta.total, 0);
  });

  test('un cálculo que excede el rango entero seguro de JavaScript se rechaza (overflow)', () => {
    // precio y cantidad son, cada uno por separado, enteros seguros — pero
    // su producto (10^11 * 10^6 = 10^17) ya no lo es. Esto es justo el caso
    // que el código dice defenderse contra: dos valores "razonables" cuyo
    // cálculo se sale de rango.
    const producto = crearProductoDePrueba({
      precioCompra: 100000000000,
      precioDetal: 100000000000,
      precioMayor: 100000000000,
      stockActual: 2000000,
    });

    const resultado = ventasService.crearVenta(
      { tipoCliente: 'detal', metodoPago: 'efectivo', items: [{ productoId: producto.id, cantidad: 1000000 }] },
      USUARIO_PRUEBA
    );

    assert.equal(resultado.exito, false);
    assert.equal(resultado.error, 'monto_invalido');
    assert.equal(
      productosRepo.buscarPorId(producto.id).stock_actual,
      2000000,
      'una venta rechazada por overflow no debe haber tocado el stock'
    );
  });
});

describe('Ventas a crédito', () => {
  test('una venta a crédito sin cliente se rechaza', () => {
    const producto = crearProductoDePrueba();

    const resultado = ventasService.crearVenta(
      { tipoCliente: 'detal', metodoPago: 'credito', items: [{ productoId: producto.id, cantidad: 1 }] },
      USUARIO_PRUEBA
    );

    assert.equal(resultado.exito, false);
    assert.equal(resultado.error, 'cliente_requerido');
  });

  test('una venta a crédito con un cliente válido se acepta y queda asociada a ese cliente', () => {
    const producto = crearProductoDePrueba({ precioDetal: 30000 });
    const cliente = crearClienteDePrueba();

    const resultado = ventasService.crearVenta(
      {
        tipoCliente: 'detal',
        metodoPago: 'credito',
        clienteId: cliente.id,
        items: [{ productoId: producto.id, cantidad: 1 }],
      },
      USUARIO_PRUEBA
    );

    assert.equal(resultado.exito, true);
    assert.equal(resultado.venta.cliente_id, cliente.id);
  });
});

describe('Descuento de stock al vender', () => {
  test('vender descuenta el stock exactamente la cantidad vendida', () => {
    const producto = crearProductoDePrueba({ stockActual: 50 });

    const resultado = ventasService.crearVenta(
      { tipoCliente: 'detal', metodoPago: 'efectivo', items: [{ productoId: producto.id, cantidad: 12 }] },
      USUARIO_PRUEBA
    );

    assert.equal(resultado.exito, true);
    assert.equal(productosRepo.buscarPorId(producto.id).stock_actual, 38);
  });

  test('vender más unidades de las que hay en stock se rechaza y no descuenta nada', () => {
    const producto = crearProductoDePrueba({ stockActual: 5 });

    const resultado = ventasService.crearVenta(
      { tipoCliente: 'detal', metodoPago: 'efectivo', items: [{ productoId: producto.id, cantidad: 6 }] },
      USUARIO_PRUEBA
    );

    assert.equal(resultado.exito, false);
    assert.equal(resultado.error, 'stock_insuficiente');
    assert.equal(productosRepo.buscarPorId(producto.id).stock_actual, 5, 'el stock debe quedar intacto tras el rechazo');
  });

  test('sumar las cantidades de un mismo producto repetido en el carrito respeta el stock disponible', () => {
    // Dos líneas del mismo producto que, sumadas, exceden el stock: el
    // servicio debe sumarlas ANTES de comparar contra el stock disponible,
    // no validar cada línea por separado (eso dejaría vender más de lo que hay).
    const producto = crearProductoDePrueba({ stockActual: 10 });

    const resultado = ventasService.crearVenta(
      {
        tipoCliente: 'detal',
        metodoPago: 'efectivo',
        items: [
          { productoId: producto.id, cantidad: 6 },
          { productoId: producto.id, cantidad: 6 },
        ],
      },
      USUARIO_PRUEBA
    );

    assert.equal(resultado.exito, false);
    assert.equal(resultado.error, 'stock_insuficiente');
  });

  test('el stock nunca puede quedar negativo: la base de datos lo impide incluso si algo lo intenta directamente', () => {
    const producto = crearProductoDePrueba({ stockActual: 3 });

    assert.throws(
      () => productosRepo.actualizarStock(producto.id, -4),
      /CHECK constraint failed/i,
      'la restricción CHECK (stock_actual >= 0) de la base de datos debe rechazar dejar el stock en negativo'
    );

    // Y el valor no debe haber quedado a mitad de camino: sigue en 3, no en
    // -1 ni en ningún estado intermedio (SQLite revierte el UPDATE completo
    // al violar el CHECK).
    assert.equal(productosRepo.buscarPorId(producto.id).stock_actual, 3);
  });
});
