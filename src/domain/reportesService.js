const reportesRepo = require('../data/reportesRepo');

const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function esFechaValida(fecha) {
  if (typeof fecha !== 'string' || !REGEX_FECHA.test(fecha)) return false;
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const fechaParseada = new Date(Date.UTC(anio, mes - 1, dia));
  // new Date() "corrige" fechas imposibles (ej. 2026-02-30 -> 2026-03-02) en
  // vez de fallar; comparar contra los componentes originales detecta eso.
  return (
    fechaParseada.getUTCFullYear() === anio && fechaParseada.getUTCMonth() === mes - 1 && fechaParseada.getUTCDate() === dia
  );
}

// Colombia es UTC-5 fijo. Restar 5 horas al instante actual y leer los
// componentes en UTC del resultado da la fecha de "hoy en Colombia" sin
// depender de en qué zona horaria esté configurado el sistema operativo del
// servidor — el mismo desplazamiento fijo que usa reportesRepo.js sobre las
// fechas guardadas, para que ambos lados queden en el mismo criterio.
function fechaColombiaHoy() {
  const ahora = new Date(Date.now() - 5 * 60 * 60 * 1000);
  const yyyy = ahora.getUTCFullYear();
  const mm = String(ahora.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(ahora.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function ventasDelDia() {
  const hoy = fechaColombiaHoy();
  const resumen = reportesRepo.resumenVentasPorRango(hoy, hoy);
  return { exito: true, fecha: hoy, ...resumen };
}

function historicoPorRango(desde, hasta) {
  if (!esFechaValida(desde) || !esFechaValida(hasta)) {
    return { exito: false, error: 'fecha_invalida', mensaje: 'Las fechas deben tener el formato AAAA-MM-DD y ser válidas.' };
  }

  if (desde > hasta) {
    return { exito: false, error: 'rango_invalido', mensaje: 'La fecha inicial no puede ser posterior a la final.' };
  }

  const resumen = reportesRepo.resumenVentasPorRango(desde, hasta);
  return { exito: true, desde, hasta, ...resumen };
}

function productosMasVendidos({ desde, hasta } = {}) {
  if (Boolean(desde) !== Boolean(hasta)) {
    return { exito: false, error: 'rango_invalido', mensaje: 'Debes indicar ambas fechas (desde y hasta) o ninguna.' };
  }

  if (desde && hasta) {
    if (!esFechaValida(desde) || !esFechaValida(hasta)) {
      return { exito: false, error: 'fecha_invalida', mensaje: 'Las fechas deben tener el formato AAAA-MM-DD y ser válidas.' };
    }
    if (desde > hasta) {
      return { exito: false, error: 'rango_invalido', mensaje: 'La fecha inicial no puede ser posterior a la final.' };
    }
  }

  const productos = reportesRepo.productosMasVendidos({ desde, hasta });
  return { exito: true, productos };
}

module.exports = { ventasDelDia, historicoPorRango, productosMasVendidos };
