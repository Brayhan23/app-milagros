const db = require('./db');

function buscarPorId(id) {
  return db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);
}

function buscarPorDocumento(documento) {
  return db.prepare('SELECT * FROM clientes WHERE documento = ?').get(documento);
}

function listar({ incluirInactivos = false } = {}) {
  if (incluirInactivos) {
    return db.prepare('SELECT * FROM clientes ORDER BY nombre').all();
  }
  return db.prepare('SELECT * FROM clientes WHERE activo = 1 ORDER BY nombre').all();
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

module.exports = { buscarPorId, buscarPorDocumento, listar, crear, actualizar, desactivar };
