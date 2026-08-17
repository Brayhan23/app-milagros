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

// Purga con archivado previo (ver comentario extendido en schema.sql sobre
// auditoria_archivo). El punto de corte se calcula UNA sola vez (misma
// variable `cutoff` para el INSERT y el DELETE de abajo) para que ambas
// operaciones actúen exactamente sobre el mismo conjunto de filas — si en
// vez de eso cada sentencia llamara a datetime('now', ...) por su cuenta,
// en el instante justo del límite podrían quedar desincronizadas (una fila
// archivada pero no borrada, o borrada sin haberse archivado).
//
// Comparación en UTC directo (creado_en < cutoff), sin el ajuste de -5h que
// reportesRepo.js usa para "día calendario": acá es una comparación de
// duración transcurrida (¿pasaron ya N días?), no una clasificación de a
// qué día pertenece — mismo criterio ya documentado en deudasRepo.js para
// dias_deuda_mas_vieja: el desplazamiento se cancelaría solo, agregarlo
// sería ruido sin efecto.
//
// Transacción: si el DELETE fallara después de un INSERT exitoso (o
// viceversa), better-sqlite3 revierte todo — nunca queda una fila borrada
// sin su copia en el archivo, ni una copia duplicada de una fila que
// después no se borró.
const purgarAntiguos = db.transaction((diasRetencion) => {
  const { cutoff } = db.prepare(`SELECT datetime('now', ?) AS cutoff`).get(`-${diasRetencion} days`);

  db.prepare(
    `INSERT INTO auditoria_archivo (id, usuario_id, usuario, accion, entidad, entidad_id, detalle, ip, creado_en)
     SELECT id, usuario_id, usuario, accion, entidad, entidad_id, detalle, ip, creado_en
     FROM auditoria
     WHERE creado_en < ?`
  ).run(cutoff);

  const resultado = db.prepare('DELETE FROM auditoria WHERE creado_en < ?').run(cutoff);

  return resultado.changes;
});

module.exports = { crear, listar, purgarAntiguos };
