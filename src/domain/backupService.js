const fs = require('fs');
const path = require('path');
const db = require('../data/db');

const BACKUP_PATH = process.env.BACKUP_PATH;
const RETENCION_DIAS = parseInt(process.env.BACKUP_RETENCION_DIAS, 10) || 30;
const INTERVALO_CHEQUEO_MS = 60 * 60 * 1000; // 1 hora
const UN_GB = 1024 ** 3;
// Umbral de espacio libre en disco por debajo del cual se advierte. Mismo
// criterio que BACKUP_RETENCION_DIAS/AUDITORIA_RETENCION_DIAS: configurable
// por .env, con un default razonable (1GB) si no se define.
const ESPACIO_MINIMO_BYTES = (parseInt(process.env.ESPACIO_MINIMO_GB, 10) || 1) * UN_GB;

// Sin esto, un BACKUP_PATH faltante hacía que el chequeo automático
// (verificarYEjecutarBackupSiFalta) se saltara el backup en completo
// silencio: necesitaBackupHoy() devuelve false y ejecutarBackup() nunca se
// llega a invocar, así que su propio mensaje de error ("BACKUP_PATH no está
// configurado") tampoco se dispara nunca. El backup automático es requisito
// crítico (ver CLAUDE.md) — esta advertencia se imprime apenas arranca el
// módulo (antes de que exista ninguna request), para que sea imposible no
// verla al hacer npm start.
if (!BACKUP_PATH) {
  console.warn('ADVERTENCIA: BACKUP_PATH no está configurado. El respaldo automático NO se está ejecutando.');
}

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

// Espacio libre real del disco donde vive `ruta`, vía fs.statfsSync (nativo
// de Node desde v18.15, sin dependencia nueva — mismo criterio que ya se usó
// para scripts/verificar-backup.js). Se ejecuta junto al backup diario (no
// es un sistema de monitoreo aparte): si el disco de la BD o el de los
// respaldos se está quedando sin espacio, es exactamente el momento en que
// más importa enterarse, porque un backup que falla por falta de espacio es
// tan grave como no tener backup en absoluto.
function espacioLibreBytes(ruta) {
  try {
    const info = fs.statfsSync(ruta);
    return info.bavail * info.bsize;
  } catch (error) {
    // Ruta no consultable (permisos, unidad de red caída, etc.): no bloquea
    // el backup por esto, simplemente no se puede advertir sobre ese disco.
    return null;
  }
}

function advertirSiEspacioBajo(etiqueta, ruta) {
  const libres = espacioLibreBytes(ruta);
  if (libres === null || libres >= ESPACIO_MINIMO_BYTES) return;

  const mensaje = `ADVERTENCIA: queda menos de ${(ESPACIO_MINIMO_BYTES / UN_GB).toFixed(1)}GB libres en el disco de ${etiqueta} (${ruta}): ${(libres / UN_GB).toFixed(2)}GB disponibles.`;
  console.warn(mensaje);
  registrarLog({ evento: 'espacio_bajo', etiqueta, ruta, bytesLibres: libres });
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

    // Ambas rutas ya existen en este punto (data/ la crea db.js al arrancar;
    // BACKUP_PATH se acaba de crear arriba), así que se pueden consultar
    // directo sin manejar el caso "todavía no existe".
    advertirSiEspacioBajo('la base de datos', path.dirname(db.name));
    advertirSiEspacioBajo('los respaldos', BACKUP_PATH);

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
  // Mismo motivo que la advertencia de arranque: acá es donde el chequeo
  // automático (arranque + cada hora) se saltaría el backup en silencio si
  // no fuera por esto. No aplica al disparo manual vía POST /backup: ese
  // camino pasa directo por ejecutarBackup(), que ya responde su propio
  // error claro sin pasar por esta función.
  if (!BACKUP_PATH) {
    console.warn('ADVERTENCIA: BACKUP_PATH no está configurado. El respaldo automático NO se está ejecutando.');
    return;
  }

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
