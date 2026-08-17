const db = require('./db');

function buscarPorUsuario(usuario) {
  return db.prepare('SELECT * FROM usuarios WHERE usuario = ?').get(usuario);
}

// correo es opcional (columna nullable): varios usuarios podrían no tenerlo
// configurado todavía. buscarPorCorreo nunca debe devolver más de una fila
// distinta por accidente porque NULL no matchea NULL en SQL — esta consulta
// jamás encuentra "cualquier usuario sin correo" al pasarle un valor vacío.
function buscarPorCorreo(correo) {
  return db.prepare('SELECT * FROM usuarios WHERE correo = ?').get(correo);
}

function buscarPorId(id) {
  return db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
}

function crearUsuario({ usuario, passwordHash }) {
  db.prepare('INSERT INTO usuarios (usuario, password_hash) VALUES (?, ?)').run(usuario, passwordHash);
  return buscarPorUsuario(usuario);
}

function actualizarPassword(id, passwordHash) {
  db.prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?').run(passwordHash, id);
  return buscarPorId(id);
}

function actualizarCorreo(id, correo) {
  db.prepare('UPDATE usuarios SET correo = ? WHERE id = ?').run(correo, id);
  return buscarPorId(id);
}

module.exports = {
  buscarPorUsuario,
  buscarPorCorreo,
  buscarPorId,
  crearUsuario,
  actualizarPassword,
  actualizarCorreo,
};
