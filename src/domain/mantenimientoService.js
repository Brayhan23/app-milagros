const fs = require('fs');
const path = require('path');
const db = require('../data/db');

// Mismo patrón de chequeo periódico en memoria que backupService/
// auditoriaService (setInterval, sin cron externo ni Tarea Programada de
// Windows). A diferencia de esos dos, VACUUM se corre MENSUAL, no diario:
// - El único generador real de páginas libres en este esquema es la purga
//   de auditoría (ventas/venta_items/abonos nunca se borran; productos y
//   clientes se desactivan con UPDATE, no se borran). El espacio reclamable
//   crece lento, al ritmo del ciclo de retención de auditoría (30 días por
//   defecto) — no tiene sentido pagar el costo de VACUUM más seguido que eso.
// - VACUUM reconstruye el archivo .db completo bajo bloqueo exclusivo. Para
//   el volumen de esta tienda (archivo de pocos MB, ver docs de la auditoría
//   de infraestructura) esto tarda bien menos de un segundo, pero sigue
//   siendo más pesado que un INSERT/UPDATE normal, así que se reserva para
//   una cadencia baja en vez de cada hora/día.
const INTERVALO_CHEQUEO_MS = 60 * 60 * 1000; // 1 hora

const MARCADOR_PATH = path.join(__dirname, '..', '..', 'logs', 'ultimo-vacuum.txt');
const LOG_PATH = path.join(__dirname, '..', '..', 'logs', 'backup.log');

function mesActual(fecha = new Date()) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
}

function yaSeEjecutoEsteMes() {
  if (!fs.existsSync(MARCADOR_PATH)) return false;
  return fs.readFileSync(MARCADOR_PATH, 'utf8').trim() === mesActual();
}

function registrarEjecucion() {
  fs.mkdirSync(path.dirname(MARCADOR_PATH), { recursive: true });
  fs.writeFileSync(MARCADOR_PATH, mesActual());
}

// Reutiliza logs/backup.log en vez de crear un archivo de log aparte: es
// mantenimiento del mismo archivo .db que ya cubre ese log, no una
// funcionalidad nueva que amerite su propia bitácora.
function registrarLog(entrada) {
  const linea = JSON.stringify({ timestamp: new Date().toISOString(), ...entrada });
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, linea + '\n');
  } catch (error) {
    console.error('No se pudo escribir el log de mantenimiento:', error.message);
  }
  console.log(`[mantenimiento] ${linea}`);
}

// Tamaño vía PRAGMA (page_count × page_size), no fs.statSync: en este mismo
// proceso, justo después de VACUUM, fs.statSync sobre el archivo puede
// devolver todavía el tamaño viejo (comprobado empíricamente en este
// entorno) — el achique en disco es real e inmediato para cualquier OTRO
// proceso, pero la propia conexión que acaba de ejecutar VACUUM no lo ve
// reflejado vía fs.statSync hasta más tarde. Los PRAGMA, en cambio, leen el
// estado real de la conexión y sí reflejan el cambio de inmediato.
function tamanioActualBytes() {
  return db.pragma('page_count', { simple: true }) * db.pragma('page_size', { simple: true });
}

function ejecutarVacuumSiFalta() {
  if (yaSeEjecutoEsteMes()) return { exito: true, omitido: true };

  try {
    const tamanioAntes = tamanioActualBytes();
    db.exec('VACUUM');
    const tamanioDespues = tamanioActualBytes();

    registrarEjecucion();
    registrarLog({ evento: 'vacuum', exito: true, tamanioAntes, tamanioDespues });

    return { exito: true, omitido: false, tamanioAntes, tamanioDespues };
  } catch (error) {
    registrarLog({ evento: 'vacuum', exito: false, error: error.message });
    return { exito: false, error: error.message };
  }
}

function iniciarProgramacionVacuum() {
  ejecutarVacuumSiFalta();
  setInterval(ejecutarVacuumSiFalta, INTERVALO_CHEQUEO_MS);
}

module.exports = { ejecutarVacuumSiFalta, iniciarProgramacionVacuum };
