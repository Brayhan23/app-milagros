const fs = require('fs');
const path = require('path');
const db = require('../data/db');

const BACKUP_PATH = process.env.BACKUP_PATH;
const RETENCION_DIAS = parseInt(process.env.BACKUP_RETENCION_DIAS, 10) || 30;
const INTERVALO_CHEQUEO_MS = 60 * 60 * 1000; // 1 hora

const LOG_PATH = path.join(__dirname, '..', '..', 'logs', 'backup.log');
const PREFIJO = path.basename(db.name, path.extname(db.name));
const PATRON_BACKUP = new RegExp(`^${PREFIJO}-(\\d{4}-\\d{2}-\\d{2})\\.db$`);

let backupEnCurso = false;

function nombreArchivoParaFecha(fecha = new Date()) {
  const yyyy = fecha.getFullYear();
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const dd = String(fecha.getDate()).padStart(2, '0');
  return `${PREFIJO}-${yyyy}-${mm}-${dd}.db`;
}

function rutaBackupDeHoy() {
  return path.join(BACKUP_PATH, nombreArchivoParaFecha());
}

function necesitaBackupHoy() {
  if (!BACKUP_PATH) return false;
  return !fs.existsSync(rutaBackupDeHoy());
}

function registrarLog(entrada) {
  const linea = JSON.stringify({ timestamp: new Date().toISOString(), ...entrada });
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, linea + '\n');
  } catch (error) {
    console.error('No se pudo escribir el log de backup:', error.message);
  }
  console.log(`[backup] ${linea}`);
}

function rotarBackups() {
  try {
    const archivos = fs
      .readdirSync(BACKUP_PATH)
      .filter((nombre) => PATRON_BACKUP.test(nombre))
      .sort((a, b) => b.match(PATRON_BACKUP)[1].localeCompare(a.match(PATRON_BACKUP)[1]));

    const aBorrar = archivos.slice(RETENCION_DIAS);
    for (const nombre of aBorrar) {
      try {
        fs.unlinkSync(path.join(BACKUP_PATH, nombre));
      } catch (error) {
        registrarLog({ evento: 'rotacion_error', archivo: nombre, error: error.message });
      }
    }
  } catch (error) {
    registrarLog({ evento: 'rotacion_error', error: error.message });
  }
}

async function ejecutarBackup() {
  if (backupEnCurso) {
    return { exito: false, error: 'en_curso', mensaje: 'Ya hay un respaldo en curso.' };
  }

  if (!BACKUP_PATH) {
    const mensaje = 'BACKUP_PATH no está configurado en .env';
    registrarLog({ exito: false, error: mensaje });
    return { exito: false, error: mensaje, mensaje };
  }

  backupEnCurso = true;
  try {
    fs.mkdirSync(BACKUP_PATH, { recursive: true });
    const destino = rutaBackupDeHoy();
    await db.backup(destino);
    const { size } = fs.statSync(destino);

    rotarBackups();

    registrarLog({ exito: true, archivo: destino, tamanioBytes: size });
    return { exito: true, archivo: destino, tamanioBytes: size };
  } catch (error) {
    registrarLog({ exito: false, error: error.message });
    return { exito: false, error: error.message, mensaje: 'No se pudo generar el respaldo.' };
  } finally {
    backupEnCurso = false;
  }
}

async function verificarYEjecutarBackupSiFalta() {
  if (necesitaBackupHoy()) {
    await ejecutarBackup();
  }
}

function iniciarProgramacionBackup() {
  verificarYEjecutarBackupSiFalta().catch(() => {});
  setInterval(() => {
    verificarYEjecutarBackupSiFalta().catch(() => {});
  }, INTERVALO_CHEQUEO_MS);
}

module.exports = {
  ejecutarBackup,
  rotarBackups,
  necesitaBackupHoy,
  nombreArchivoParaFecha,
  iniciarProgramacionBackup,
};
