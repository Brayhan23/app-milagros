const db = require('./db');

function buscarPorId(id) {
  return db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);
}

function buscarPorDocumento(documento) {
  return db.prepare('SELECT * FROM clientes WHERE documento = ?').get(documento);
}

// tiene_ventas (0/1): si el cliente ya tiene alguna venta asociada (pagada o
// a crédito), para que el frontend sepa cuándo puede ofrecer "Eliminar"
// (borrado permanente) sin tener que preguntarle al backend fila por fila.
function listar({ incluirInactivos = false } = {}) {
  const filtroActivo = incluirInactivos ? '' : 'WHERE activo = 1';
  return db
    .prepare(
      `SELECT *, EXISTS(SELECT 1 FROM ventas WHERE cliente_id = clientes.id) AS tiene_ventas
       FROM clientes
       ${filtroActivo}
       ORDER BY nombre`
    )
    .all();
}

function crear({ nombre, documento, telefono, correo, esMayorista }) {
  const info = db
    .prepare(
      `INSERT INTO clientes (nombre, documento, telefono, correo, es_mayorista)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(nombre, documento, telefono, correo, esMayorista ? 1 : 0);

  return buscarPorId(info.lastInsertRowid);
}

function actualizar(id, { nombre, documento, telefono, correo, esMayorista }) {
  db.prepare(
    `UPDATE clientes
     SET nombre = ?, documento = ?, telefono = ?, correo = ?, es_mayorista = ?,
         actualizado_en = datetime('now')
     WHERE id = ?`
  ).run(nombre, documento, telefono, correo, esMayorista ? 1 : 0, id);

  return buscarPorId(id);
}

function desactivar(id) {
  db.prepare(`UPDATE clientes SET activo = 0, actualizado_en = datetime('now') WHERE id = ?`).run(id);
  return buscarPorId(id);
}

// Reactivar solo cambia `activo`, nunca `documento`: mismo caso borde que
// productosRepo.reactivar con codigo_barras — la fila conserva el mismo
// documento (único en la tabla) mientras estaba desactivada, así que este
// UPDATE no puede chocar con la restricción UNIQUE de esa columna (ver el
// comentario en clientesService.reactivarCliente).
function reactivar(id) {
  db.prepare(`UPDATE clientes SET activo = 1, actualizado_en = datetime('now') WHERE id = ?`).run(id);
  return buscarPorId(id);
}

// Borrado permanente: solo lo llama clientesService.eliminarCliente después
// de confirmar que el cliente nunca tuvo una venta asociada, así que acá no
// hace falta repetir esa validación.
function contarVentas(id) {
  const { cantidad } = db.prepare('SELECT COUNT(*) AS cantidad FROM ventas WHERE cliente_id = ?').get(id);
  return cantidad;
}

function eliminar(id) {
  db.prepare('DELETE FROM clientes WHERE id = ?').run(id);
}

module.exports = {
  buscarPorId,
  buscarPorDocumento,
  listar,
  crear,
  actualizar,
  desactivar,
  reactivar,
  contarVentas,
  eliminar,
};
