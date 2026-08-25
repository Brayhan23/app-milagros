const db = require('./db');

function buscarPorId(id) {
  return db.prepare('SELECT * FROM productos WHERE id = ?').get(id);
}

function buscarPorCodigoBarras(codigoBarras) {
  return db.prepare('SELECT * FROM productos WHERE codigo_barras = ?').get(codigoBarras);
}

// tiene_ventas (0/1): si el producto ya aparece en venta_items, para que el
// frontend sepa cuándo puede ofrecer "Eliminar" (borrado permanente) sin
// tener que preguntarle al backend fila por fila.
function listar({ incluirInactivos = false } = {}) {
  const filtroActivo = incluirInactivos ? '' : 'WHERE activo = 1';
  return db
    .prepare(
      `SELECT *, EXISTS(SELECT 1 FROM venta_items WHERE producto_id = productos.id) AS tiene_ventas
       FROM productos
       ${filtroActivo}
       ORDER BY nombre`
    )
    .all();
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

// Reactivar solo cambia `activo`, nunca `codigo_barras`: la fila conserva el
// mismo valor que ya tenía (único en la tabla) mientras estaba desactivada,
// así que no hay forma de que este UPDATE choque con la restricción UNIQUE
// de esa columna (ver el comentario en productosService.reactivarProducto).
function reactivar(id) {
  db.prepare(`UPDATE productos SET activo = 1, actualizado_en = datetime('now') WHERE id = ?`).run(id);
  return buscarPorId(id);
}

// Borrado permanente (a diferencia de desactivar): solo lo llama
// productosService.eliminarProducto después de confirmar que el producto
// nunca se usó, así que acá no hace falta repetir esa validación.
function contarVentaItems(id) {
  const { cantidad } = db.prepare('SELECT COUNT(*) AS cantidad FROM venta_items WHERE producto_id = ?').get(id);
  return cantidad;
}

function eliminar(id) {
  db.prepare('DELETE FROM productos WHERE id = ?').run(id);
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
  reactivar,
  contarVentaItems,
  eliminar,
  // Nuevas exportaciones:
  actualizarStock,
  listarBajoStock,
  obtenerStockEnTiempoReal,
};


