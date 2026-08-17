const db = require('./db');

function obtener() {
  return db.prepare('SELECT * FROM configuracion_empresa WHERE id = 1').get();
}

function actualizar({ nombreEmpresa, nit, direccion, telefono, correo, logoRuta, ivaPorcentaje }) {
  db.prepare(
    `UPDATE configuracion_empresa
     SET nombre_empresa = ?, nit = ?, direccion = ?, telefono = ?, correo = ?, logo_ruta = ?, iva_porcentaje = ?,
         actualizado_en = datetime('now')
     WHERE id = 1`
  ).run(nombreEmpresa, nit, direccion, telefono, correo, logoRuta, ivaPorcentaje);

  return obtener();
}

module.exports = { obtener, actualizar };
