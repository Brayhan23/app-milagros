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

module.exports = {
  buscarPorId,
  buscarPorCodigoBarras,
  listar,
  crear,
  actualizar,
  desactivar,
};
