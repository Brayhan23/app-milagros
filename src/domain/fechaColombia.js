// Punto único de conversión de fechas UTC (como las guarda datetime('now')
// en SQLite) a hora de Colombia, para el lado del backend que arma
// contenido dirigido a la usuaria o a un tercero (factura por correo,
// reportes exportados en Excel/PDF) FUERA de las consultas SQL que
// reportesRepo.js/auditoriaRepo.js ya ajustan con date(columna, '-5 hours')
// — esos dos archivos solo usan el desplazamiento dentro del SQL para
// filtrar/agrupar, nunca para mostrarle una fecha ya formateada a alguien.
// Mismo desplazamiento fijo que esos archivos documentan (Colombia es
// UTC-5 todo el año, sin horario de verano).
const DESPLAZAMIENTO_HORAS_COLOMBIA = -5;

const NOMBRES_MES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// Parsea "AAAA-MM-DD HH:MM:SS" (o con "T") guardado en UTC y devuelve los
// componentes ya trasladados a hora de Colombia. El cálculo se hace en
// milisegundos UTC (Date.UTC + getUTC*) y nunca con la hora local del
// proceso de Node, para que el resultado no dependa de en qué huso horario
// esté configurado el servidor donde corre la app.
function componentesColombia(fechaUtc) {
  const match = String(fechaUtc || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return null;

  const [, anio, mes, dia, hora, minuto, segundo] = match;
  const instanteUtc = Date.UTC(
    Number(anio),
    Number(mes) - 1,
    Number(dia),
    Number(hora || 0),
    Number(minuto || 0),
    Number(segundo || 0)
  );
  const instanteColombia = new Date(instanteUtc + DESPLAZAMIENTO_HORAS_COLOMBIA * 60 * 60 * 1000);

  return {
    anio: instanteColombia.getUTCFullYear(),
    mes: instanteColombia.getUTCMonth() + 1,
    dia: instanteColombia.getUTCDate(),
    hora: instanteColombia.getUTCHours(),
    minuto: instanteColombia.getUTCMinutes(),
  };
}

// "AAAA-MM-DD" en hora de Colombia, para la columna de fecha de los reportes
// exportados (Excel/PDF): mismo formato compacto que ya usaban antes
// (creado_en.slice(0, 10)), corrigiendo el día/hora al huso horario que le
// corresponde en vez de tomar el valor UTC crudo.
function fechaColombiaISO(fechaUtc) {
  const c = componentesColombia(fechaUtc);
  if (!c) return '';
  const pad2 = (n) => String(n).padStart(2, '0');
  return `${c.anio}-${pad2(c.mes)}-${pad2(c.dia)}`;
}

// Fecha legible en español con hora en formato 12h — mismo formato que ya
// usa formatearFecha() en src/public/app.js, para que la factura que llega
// por correo se vea igual que la que se imprime desde la pantalla.
function formatearFechaColombia(fechaUtc, { conHora = true } = {}) {
  const c = componentesColombia(fechaUtc);
  if (!c) return '';

  const fechaLegible = `${c.dia} de ${NOMBRES_MES[c.mes - 1]}, ${c.anio}`;
  if (!conHora) return fechaLegible;

  const periodo = c.hora >= 12 ? 'p.m.' : 'a.m.';
  const hora12 = c.hora % 12 === 0 ? 12 : c.hora % 12;
  const minutoTexto = String(c.minuto).padStart(2, '0');
  return `${fechaLegible} · ${hora12}:${minutoTexto} ${periodo}`;
}

module.exports = { fechaColombiaISO, formatearFechaColombia };
