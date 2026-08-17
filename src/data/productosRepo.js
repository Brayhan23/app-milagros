const db = require('./db');

function buscarPorId(id) {
  return db.prepare('SELECT * FROM productos WHERE id = ?').get(id);
}

function buscarPorCodigoBarras(codigoBarras) {
  return db.prepare('SELECT * FROM productos WHERE codigo_barras = ?').get(codigoBarras);
}

function listar({ incluirInactivos = false } = {}) {
  if (incluirInactivos) {
    return db.prepare('SELECT * FROM productos ORDER BY nombre').all();
  }
  return db.prepare('SELECT * FROM productos WHERE activo = 1 ORDER BY nombre').all();
}

function crear({
  codigoBarras,
  nombre,
  descripcion,
  precioCompra,
  precioDetal,
  precioMayor,
  stockActual,
  stockMinimo,
}) {
  const info = db
    .prepare(
      `INSERT INTO productos
        (codigo_barras, nombre, descripcion, precio_compra, precio_detal, precio_mayor, stock_actual, stock_minimo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(codigoBarras, nombre, descripcion, precioCompra, precioDetal, precioMayor, stockActual, stockMinimo);

  return buscarPorId(info.lastInsertRowid);
}

function actualizar(id, { codigoBarras, nombre, descripcion, precioCompra, precioDetal, precioMayor, stockMinimo }) {
  db.prepare(
    `UPDATE productos
     SET codigo_barras = ?, nombre = ?, descripcion = ?, precio_compra = ?, precio_detal = ?, precio_mayor = ?, stock_minimo = ?,
         actualizado_en = datetime('now')
     WHERE id = ?`
  ).run(codigoBarras, nombre, descripcion, precioCompra, precioDetal, precioMayor, stockMinimo, id);

  return buscarPorId(id);
}

function desactivar(id) {
  db.prepare(`UPDATE productos SET activo = 0, actualizado_en = datetime('now') WHERE id = ?`).run(id);
  return buscarPorId(id);
}

// --- Nuevas funciones para HU-03, HU-04 y HU-05 ---

function actualizarStock(id, cantidad) {
  db.prepare(
    `UPDATE productos 
     SET stock_actual = stock_actual + ?, 
         actualizado_en = datetime('now') 
     WHERE id = ?`
  ).run(cantidad, id);

  return buscarPorId(id);
}

function listarBajoStock() {
  return db
    .prepare(
      `SELECT * FROM productos 
       WHERE activo = 1 AND stock_actual <= stock_minimo 
       ORDER BY stock_actual ASC, nombre ASC`
    )
    .all();
}

function obtenerStockEnTiempoReal() {
  return db
    .prepare(
      `SELECT id, codigo_barras, nombre, stock_actual, stock_minimo,
              (stock_actual <= stock_minimo) AS bajo_stock
       FROM productos 
       WHERE activo = 1 
       ORDER BY nombre ASC`
    )
    .all();
}
// --- HU-03, HU-04 y HU-05 ---
module.exports = {
  buscarPorId,
  buscarPorCodigoBarras,
  listar,
  crear,
  actualizar,
  desactivar,
  // Nuevas exportaciones:
  actualizarStock,
  listarBajoStock,
  obtenerStockEnTiempoReal,
};


