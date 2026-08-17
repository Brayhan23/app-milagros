const db = require('./db');

// Mismo desplazamiento fijo que reportesRepo.js usa para clasificar a qué
// día calendario colombiano pertenece un evento guardado en UTC. Ver el
// comentario extendido en reportesRepo.js para la justificación completa.
const DESPLAZAMIENTO_COLOMBIA = '-5 hours';

// Tope de filas por consulta: es el registro de auditoría de una tienda
// local, no un sistema con volumen para justificar paginación todavía; el
// límite es solo una salvaguarda para no mandar miles de filas de golpe al
// frontend si algún filtro queda demasiado amplio.
const LIMITE_FILAS = 500;

function crear({ usuarioId, usuario, accion, entidad, entidadId, detalle, ip }) {
  db.prepare(
    `INSERT INTO auditoria (usuario_id, usuario, accion, entidad, entidad_id, detalle, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(usuarioId, usuario, accion, entidad, entidadId, detalle, ip);
}

function listar({ desde, hasta, accion, usuario } = {}) {
  const condiciones = [];
  const parametros = [];

  if (desde) {
    condiciones.push('date(creado_en, ?) >= ?');
    parametros.push(DESPLAZAMIENTO_COLOMBIA, desde);
  }
  if (hasta) {
    condiciones.push('date(creado_en, ?) <= ?');
    parametros.push(DESPLAZAMIENTO_COLOMBIA, hasta);
  }
  if (accion) {
    condiciones.push('accion = ?');
    parametros.push(accion);
  }
  if (usuario) {
    condiciones.push('usuario = ?');
    parametros.push(usuario);
  }

  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

  return db
    .prepare(`SELECT * FROM auditoria ${where} ORDER BY id DESC LIMIT ?`)
    .all(...parametros, LIMITE_FILAS);
}

module.exports = { crear, listar };
