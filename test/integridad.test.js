'use strict';

// IMPORTANTE (integridad de datos): migraciones idempotentes, backup
// restaurable, purga de auditoría con archivado previo, y que eliminar un
// producto/cliente con historial quede bloqueado.
const { crearBaseDeDatosTemporal } = require('./helpers/dbTemporal');
const bd = crearBaseDeDatosTemporal('milagros-test-integridad-');

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const Database = require('better-sqlite3');

const db = require('../src/data/db');
const productosService = require('../src/domain/productosService');
const clientesService = require('../src/domain/clientesService');
const ventasService = require('../src/domain/ventasService');
const backupService = require('../src/domain/backupService');
const auditoriaService = require('../src/domain/auditoriaService');
const { crearProductoDePrueba, crearClienteDePrueba, USUARIO_PRUEBA } = require('./helpers/fixtures');

after(() => bd.limpiar());

describe('Migraciones idempotentes', () => {
  test('arrancar la app dos veces seguidas contra el mismo archivo no rompe nada ni duplica columnas', () => {
    const script = path.join(__dirname, 'helpers', 'arrancarDb.js');
    // Un archivo de BD propio para esta prueba (no el que ya está abierto
    // por este proceso de test): los procesos hijos abren su propia
    // conexión, y no tiene sentido que compita con la del proceso padre.
    const dbPropia = path.join(bd.dir, 'migraciones.db');
    const env = { ...process.env, DB_PATH: dbPropia };

    // Primer "arranque": crea el esquema desde cero.
    execFileSync(process.execPath, [script], { env });
    assert.ok(fs.existsSync(dbPropia), 'el primer arranque debe crear el archivo de base de datos');

    // Segundo "arranque" contra el MISMO archivo: si alguna migración no
    // estuviera protegida con columnaExiste(), acá fallaría con un error
    // de "duplicate column name" y execFileSync lanzaría por el código de
    // salida distinto de 0.
    assert.doesNotThrow(() => execFileSync(process.execPath, [script], { env }));

    // Confirma además que las columnas migradas existen UNA sola vez cada
    // una (PRAGMA table_info no podría repetir un nombre de columna, pero
    // esto deja explícito qué se está garantizando).
    const dbVerificacion = new Database(dbPropia, { readonly: true });
    const columnasVentas = dbVerificacion.prepare('PRAGMA table_info(ventas)').all().map((c) => c.name);
    dbVerificacion.close();
    const vecesClienteId = columnasVentas.filter((c) => c === 'cliente_id').length;
    assert.equal(vecesClienteId, 1);
  });
});

describe('Backup', () => {
  test('el backup genera un archivo que es una base de datos SQLite válida y restaurable, con los mismos datos', () => {
    const producto = crearProductoDePrueba({ nombre: 'Producto Para Verificar Backup' });

    const resultado = backupService.ejecutarBackup();
    // ejecutarBackup() es async (usa db.backup()), pero better-sqlite3 lo
    // ejecuta de forma síncrona por dentro salvo por el await de la promesa
    // — esperamos la promesa igual, de forma explícita.
    return resultado.then((r) => {
      assert.equal(r.exito, true, r.mensaje);
      assert.ok(fs.existsSync(r.archivo), 'el archivo de respaldo debe existir en disco');
      assert.ok(r.tamanioBytes > 0, 'el archivo de respaldo no debe estar vacío');

      // "Restaurable" = se puede abrir como base de datos real y consultar.
      const respaldo = new Database(r.archivo, { readonly: true });
      const fila = respaldo.prepare('SELECT nombre FROM productos WHERE id = ?').get(producto.id);
      respaldo.close();
      assert.equal(fila.nombre, 'Producto Para Verificar Backup', 'el respaldo debe contener los datos reales al momento de generarlo');
    });
  });

  test('el nombre del archivo de respaldo sigue el patrón milagros-AAAA-MM-DD.db (el que espera el procedimiento de restauración)', () => {
    const nombre = backupService.nombreArchivoParaFecha(new Date(2026, 7, 25)); // 25 de agosto de 2026
    assert.equal(nombre, 'milagros-2026-08-25.db');
  });
});

describe('Purga de auditoría (archiva antes de borrar)', () => {
  test('un evento viejo se mueve a auditoria_archivo y desaparece de auditoria; uno reciente no se toca', () => {
    const insertar = db.prepare(
      `INSERT INTO auditoria (usuario, accion, entidad, entidad_id, detalle, creado_en)
       VALUES (?, ?, ?, ?, ?, datetime('now', ?))`
    );
    // 40 días atrás: más viejo que la retención por defecto (30 días) -> debe purgarse.
    insertar.run('usuaria_prueba', 'producto_creado', 'producto', 1, 'Evento viejo de prueba', '-40 days');
    // 5 días atrás: dentro de la retención -> debe conservarse en auditoria.
    insertar.run('usuaria_prueba', 'producto_creado', 'producto', 2, 'Evento reciente de prueba', '-5 days');

    auditoriaService.purgarAntiguos();

    const activos = db.prepare(`SELECT detalle FROM auditoria WHERE detalle IN (?, ?)`).all('Evento viejo de prueba', 'Evento reciente de prueba');
    assert.deepEqual(
      activos.map((f) => f.detalle),
      ['Evento reciente de prueba'],
      'solo el evento reciente debe seguir en la tabla activa'
    );

    const archivados = db.prepare(`SELECT detalle FROM auditoria_archivo WHERE detalle = ?`).all('Evento viejo de prueba');
    assert.equal(archivados.length, 1, 'el evento viejo debe estar archivado, no perdido');
  });
});

describe('Eliminar con historial', () => {
  test('un producto que ya se vendió alguna vez no se puede eliminar de forma permanente', () => {
    const producto = crearProductoDePrueba({ stockActual: 1 });
    const venta = ventasService.crearVenta(
      { tipoCliente: 'detal', metodoPago: 'efectivo', items: [{ productoId: producto.id, cantidad: 1 }] },
      USUARIO_PRUEBA
    );
    assert.equal(venta.exito, true, 'fixture: la venta debe crearse para que el producto tenga historial');

    const resultado = productosService.eliminarProducto(producto.id, USUARIO_PRUEBA);

    assert.equal(resultado.exito, false);
    assert.equal(resultado.error, 'no_se_puede_eliminar');
  });

  test('un producto sin ventas pero con stock todavía existente no se puede eliminar', () => {
    const producto = crearProductoDePrueba({ stockActual: 3 });

    const resultado = productosService.eliminarProducto(producto.id, USUARIO_PRUEBA);

    assert.equal(resultado.exito, false);
    assert.equal(resultado.error, 'no_se_puede_eliminar');
  });

  test('un producto sin ventas y con stock en cero SÍ se puede eliminar', () => {
    const producto = crearProductoDePrueba({ stockActual: 0 });

    const resultado = productosService.eliminarProducto(producto.id, USUARIO_PRUEBA);

    assert.equal(resultado.exito, true);
  });

  test('un cliente con al menos una venta asociada no se puede eliminar de forma permanente', () => {
    const producto = crearProductoDePrueba({ stockActual: 1 });
    const cliente = crearClienteDePrueba();
    const venta = ventasService.crearVenta(
      { tipoCliente: 'detal', metodoPago: 'credito', clienteId: cliente.id, items: [{ productoId: producto.id, cantidad: 1 }] },
      USUARIO_PRUEBA
    );
    assert.equal(venta.exito, true, 'fixture: la venta a crédito debe crearse para que el cliente tenga historial');

    const resultado = clientesService.eliminarCliente(cliente.id, USUARIO_PRUEBA);

    assert.equal(resultado.exito, false);
    assert.equal(resultado.error, 'no_se_puede_eliminar');
  });

  test('un cliente sin ninguna venta asociada sí se puede eliminar', () => {
    const cliente = crearClienteDePrueba();

    const resultado = clientesService.eliminarCliente(cliente.id, USUARIO_PRUEBA);

    assert.equal(resultado.exito, true);
  });
});
