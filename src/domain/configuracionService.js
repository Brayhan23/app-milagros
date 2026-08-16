const configuracionRepo = require('../data/configuracionRepo');

const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizarTexto(valor) {
  if (typeof valor !== 'string') return valor;
  const limpio = valor.trim();
  return limpio === '' ? null : limpio;
}

// La fila con id=1 la siembra schema.sql (INSERT OR IGNORE) apenas se crea
// la tabla, así que en condiciones normales configuracionRepo.obtener()
// siempre encuentra algo: no hace falta un valor por defecto de respaldo
// aquí, ese caso ya está cubierto en el esquema.
function obtenerConfiguracion() {
  return { exito: true, configuracion: configuracionRepo.obtener() };
}

function actualizarConfiguracion(datos = {}) {
  const actual = configuracionRepo.obtener();

  const nombreEmpresa = datos.nombreEmpresa !== undefined ? normalizarTexto(datos.nombreEmpresa) : actual.nombre_empresa;
  const nit = datos.nit !== undefined ? normalizarTexto(datos.nit) : actual.nit;
  const direccion = datos.direccion !== undefined ? normalizarTexto(datos.direccion) : actual.direccion;
  const telefono = datos.telefono !== undefined ? normalizarTexto(datos.telefono) : actual.telefono;
  const correo = datos.correo !== undefined ? normalizarTexto(datos.correo) : actual.correo;
  // Solo la ruta/URL del logo se guarda en la BD, nunca la imagen (ver
  // comentario en schema.sql). El archivo en sí va aparte, por ejemplo bajo
  // src/public/uploads/, para que el navegador lo pueda servir como
  // /uploads/logo.png sin pasar por la API.
  const logoRuta = datos.logoRuta !== undefined ? normalizarTexto(datos.logoRuta) : actual.logo_ruta;

  if (!nombreEmpresa) {
    return { exito: false, error: 'nombre_requerido', mensaje: 'El nombre de la empresa es obligatorio.' };
  }

  if (correo && !REGEX_CORREO.test(correo)) {
    return { exito: false, error: 'correo_invalido', mensaje: 'El correo de la empresa no es válido.' };
  }

  const configuracion = configuracionRepo.actualizar({ nombreEmpresa, nit, direccion, telefono, correo, logoRuta });
  return { exito: true, configuracion };
}

module.exports = { obtenerConfiguracion, actualizarConfiguracion };
