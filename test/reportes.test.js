'use strict';

// ÚTIL: clasificación por zona horaria de Colombia, que los totales de
// reportes coincidan con la suma real de las ventas del período, que la
// ganancia se calcule contra el costo histórico (no el actual), y que los
// archivos exportados nunca incluyan la ganancia del negocio.
const { crearBaseDeDatosTemporal } = require('./helpers/dbTemporal');
const bd = crearBaseDeDatosTemporal('milagros-test-reportes-');

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');

const db = require('../src/data/db');
const ventasService = require('../src/domain/ventasService');
const reportesService = require('../src/domain/reportesService');
const reportesRepo = require('../src/data/reportesRepo');
const exportacionService = require('../src/domain/exportacionService');
const productosService = require('../src/domain/productosService');
const fechaColombia = require('../src/domain/fechaColombia');
const { crearProductoDePrueba, USUARIO_PRUEBA } = require('./helpers/fixtures');

after(() => bd.limpiar());

// El servicio de ventas siempre usa datetime('now') — para probar un caso
// borde de horario hace falta insertar una venta directo por SQL con una
// fecha UTC elegida a mano, algo que ninguna ruta normal de la app hace.
function insertarVentaConFechaUtc(creadoEnUtc, total = 10000) {
  const info = db
    .prepare(
      `INSERT INTO ventas (tipo_cliente, metodo_pago, cliente_id, descuento, subtotal, total, iva_porcentaje, creado_en)
       VALUES ('detal', 'efectivo', NULL, 0, ?, ?, 19, ?)`
    )
    .run(total, total, creadoEnUtc);
  return info.lastInsertRowid;
}

// Fechas de referencia para las pruebas de zona horaria: SIEMPRE varios
// días antes de "hoy" (calculadas en el momento de correr la prueba, nunca
// escritas a mano), a propósito para que jamás puedan coincidir con la
// fecha real que usan las pruebas de "totales del reporte" más abajo en
// este mismo archivo — todas comparten una sola base de datos temporal por
// archivo, así que dos pruebas insertando ventas bajo la fecha de "hoy"
// se contaminarían entre sí.
function isoUtc(fecha) {
  return fecha.toISOString().slice(0, 10);
}

const REFERENCIA_COLOMBIA = new Date(Date.now() - 10 * 86400000); // 10 días atrás
const DIA_COLOMBIA_ISO = isoUtc(REFERENCIA_COLOMBIA);
// 19:30 hora Colombia de ese día = 00:30 UTC del día calendario siguiente.
const DIA_SIGUIENTE_UTC = new Date(REFERENCIA_COLOMBIA.getTime() + 86400000);
const TIMESTAMP_BORDE_UTC = `${isoUtc(DIA_SIGUIENTE_UTC)} 00:30:00`;

describe('Zona horaria (Colombia = UTC-5)', () => {
  test('una venta a las 7:30pm hora Colombia (00:30 UTC del día siguiente) se clasifica en el día de Colombia, no en el de UTC', () => {
    insertarVentaConFechaUtc(TIMESTAMP_BORDE_UTC, 15000);

    const delDiaColombiano = reportesRepo.resumenVentasPorRango(DIA_COLOMBIA_ISO, DIA_COLOMBIA_ISO);
    assert.equal(delDiaColombiano.cantidadVentas, 1, 'la venta debe contarse el día calendario en Colombia, no el de UTC');

    const delDiaUtc = reportesRepo.resumenVentasPorRango(isoUtc(DIA_SIGUIENTE_UTC), isoUtc(DIA_SIGUIENTE_UTC));
    assert.equal(delDiaUtc.cantidadVentas, 0, 'esa misma venta NO debe aparecer bajo su fecha en UTC crudo');
  });

  test('fechaColombia.js aplica el mismo criterio al formatear esa venta para mostrarla en pantalla', () => {
    // Esta comparación es de texto fijo (no de fecha real), así que sí
    // puede quedar con una fecha escrita a mano sin riesgo de contaminar
    // otras pruebas: no toca la base de datos en absoluto.
    assert.equal(fechaColombia.fechaColombiaISO('2026-08-26 00:30:00'), '2026-08-25');
    assert.equal(fechaColombia.formatearFechaColombia('2026-08-26 00:30:00'), '25 de agosto, 2026 · 7:30 p.m.');
  });
});

describe('Los totales del reporte coinciden con la suma real de las ventas', () => {
  test('el total facturado del rango es exactamente la suma de las ventas creadas en ese rango', () => {
    const producto = crearProductoDePrueba({ precioDetal: 10000, stockActual: 100 });
    // Colombia, no UTC: reportesRepo clasifica cada venta por su fecha en
    // Colombia (date(creado_en, '-5 hours')), así que "hoy" tiene que usar el
    // mismo criterio — si no, esta prueba falla ella sola entre las 00:00 y
    // las 04:59 UTC (7pm-11:59pm en Colombia), cuando el día calendario en
    // Colombia todavía no alcanzó al de UTC.
    const hoy = fechaColombia.fechaColombiaISO(new Date().toISOString());

    // Instantánea ANTES de crear nada: este archivo comparte una sola base
    // de datos temporal entre todas sus pruebas, así que "hoy" puede ya
    // traer ventas de otras pruebas de este mismo archivo. Comparar por
    // DIFERENCIA (no por conteo absoluto) hace la prueba correcta sin
    // importar en qué orden corran las pruebas del archivo.
    const antes = reportesService.historicoPorRango(hoy, hoy);
    assert.equal(antes.exito, true);

    const montos = [10000, 20000, 30000];
    for (const monto of montos) {
      const cantidad = monto / 10000;
      const resultado = ventasService.crearVenta(
        { tipoCliente: 'detal', metodoPago: 'efectivo', items: [{ productoId: producto.id, cantidad }] },
        USUARIO_PRUEBA
      );
      assert.equal(resultado.exito, true);
    }

    const despues = reportesService.historicoPorRango(hoy, hoy);
    assert.equal(despues.exito, true);
    assert.equal(despues.cantidadVentas - antes.cantidadVentas, 3);
    assert.equal(despues.totalFacturado - antes.totalFacturado, montos.reduce((a, b) => a + b, 0));
  });
});

describe('Ganancia contra el costo histórico', () => {
  test('si el precio de compra del producto cambia DESPUÉS de la venta, la ganancia reportada sigue usando el costo de cuando se vendió', () => {
    const producto = crearProductoDePrueba({ precioCompra: 5000, precioDetal: 12000, stockActual: 10 });
    // Mismo motivo que en la prueba anterior: "hoy" en Colombia, no en UTC.
    const hoy = fechaColombia.fechaColombiaISO(new Date().toISOString());

    const antes = reportesService.historicoPorRango(hoy, hoy);
    assert.equal(antes.exito, true);

    const venta = ventasService.crearVenta(
      { tipoCliente: 'detal', metodoPago: 'efectivo', items: [{ productoId: producto.id, cantidad: 1 }] },
      USUARIO_PRUEBA
    );
    assert.equal(venta.exito, true);
    // Ganancia esperada de ESTA venta: 12000 (precio de venta) - 5000 (costo al momento de vender) = 7000.

    // Ahora el costo del producto sube — no debería alterar la venta ya hecha.
    const actualizacion = productosService.actualizarProducto(producto.id, { precioCompra: 9000 }, USUARIO_PRUEBA);
    assert.equal(actualizacion.exito, true);

    const despues = reportesService.historicoPorRango(hoy, hoy);
    assert.equal(despues.exito, true);
    assert.equal(despues.gananciaTotal - antes.gananciaTotal, 7000, 'debe usar el costo histórico (5000), no el costo actual (9000)');
    assert.equal(despues.gananciaAproximada, false, 'esta venta sí guardó su costo histórico, no debería marcarse como aproximada');
  });
});

describe('Exportación: nunca incluye la ganancia del negocio', () => {
  test('el objeto que arma los reportes exportados no trae gananciaTotal ni gananciaAproximada', () => {
    const producto = crearProductoDePrueba({ precioCompra: 1000, precioDetal: 5000, stockActual: 5 });
    const venta = ventasService.crearVenta(
      { tipoCliente: 'detal', metodoPago: 'efectivo', items: [{ productoId: producto.id, cantidad: 1 }] },
      USUARIO_PRUEBA
    );
    assert.equal(venta.exito, true);

    const hoy = new Date().toISOString().slice(0, 10);
    const datos = exportacionService.obtenerDatosReporte(hoy, hoy);

    assert.equal(datos.exito, true);
    assert.equal(Object.prototype.hasOwnProperty.call(datos, 'gananciaTotal'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(datos, 'gananciaAproximada'), false);
  });

  test('el archivo Excel generado de verdad no contiene ninguna celda con la palabra "ganancia" ni con el monto de la ganancia', async () => {
    const producto = crearProductoDePrueba({ precioCompra: 1000, precioDetal: 5000, stockActual: 5 });
    const venta = ventasService.crearVenta(
      { tipoCliente: 'detal', metodoPago: 'efectivo', items: [{ productoId: producto.id, cantidad: 1 }] },
      USUARIO_PRUEBA
    );
    assert.equal(venta.exito, true);
    const gananciaDeEstaVenta = 5000 - 1000; // lo que NO debe aparecer en el archivo

    const hoy = new Date().toISOString().slice(0, 10);
    const resultado = await exportacionService.generarExcelRango(hoy, hoy);
    assert.equal(resultado.exito, true);

    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(resultado.buffer);
    const hoja = libro.worksheets[0];

    let contieneGanancia = false;
    let contieneMontoGanancia = false;
    hoja.eachRow((fila) => {
      fila.eachCell((celda) => {
        const valor = celda.value;
        if (typeof valor === 'string' && valor.toLowerCase().includes('ganancia')) contieneGanancia = true;
        if (typeof valor === 'number' && valor === gananciaDeEstaVenta) contieneMontoGanancia = true;
      });
    });

    assert.equal(contieneGanancia, false, 'ninguna celda del Excel debe mencionar la palabra "ganancia"');
    assert.equal(contieneMontoGanancia, false, 'el monto exacto de la ganancia no debe aparecer en ninguna celda numérica');
  });
});
