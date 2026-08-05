const db = require('./db');

function buscarPorUsuario(usuario) {
  return db.prepare('SELECT * FROM usuarios WHERE usuario = ?').get(usuario);
}

function crearUsuario({ usuario, passwordHash }) {
  db.prepare('INSERT INTO usuarios (usuario, password_hash) VALUES (?, ?)').run(usuario, passwordHash);
  return buscarPorUsuario(usuario);
}

module.exports = { buscarPorUsuario, crearUsuario };
