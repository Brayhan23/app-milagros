'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Punto único que arma el entorno de pruebas: una base de datos SQLite
// descartable en una carpeta temporal del sistema operativo — NUNCA
// data/milagros.db. Debe llamarse como la PRIMERA línea de cada archivo de
// prueba, antes de requerir cualquier módulo de src/ que dependa (directa o
// indirectamente) de src/data/db.js: ese archivo lee process.env.DB_PATH
// una sola vez, al cargarse, y desde ahí queda fijo para el resto del
// proceso — fijar la variable después de que algo ya lo haya requerido no
// tendría efecto.
//
// Cada archivo de prueba llama a esto una sola vez y obtiene su propia base
// de datos aislada. Esto funciona sin interferencia entre archivos porque
// `node --test` con múltiples archivos corre cada uno en su propio proceso
// hijo (comportamiento por defecto del test runner de Node), así que no hay
// un único módulo db.js compartido entre archivos de prueba distintos.
function crearBaseDeDatosTemporal(prefijo = 'milagros-test-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefijo));
  const dbPath = path.join(dir, 'milagros.db');

  process.env.DB_PATH = dbPath;
  // Carpetas de trabajo (backups, logs) también temporales y propias de
  // esta corrida — nunca las carpetas reales del proyecto.
  process.env.BACKUP_PATH = path.join(dir, 'backups');
  process.env.LOGS_PATH = path.join(dir, 'logs');
  process.env.AUDITORIA_RETENCION_DIAS = process.env.AUDITORIA_RETENCION_DIAS || '30';
  process.env.BACKUP_RETENCION_DIAS = process.env.BACKUP_RETENCION_DIAS || '30';
  // "Configurado" con valores falsos, nunca reales: alcanza para que
  // recuperacionService no rechace de entrada con "smtp_no_configurado". El
  // envío real se mockea aparte en cada prueba que lo necesite — en ningún
  // momento se abre una conexión SMTP de verdad.
  process.env.SMTP_HOST = process.env.SMTP_HOST || 'smtp.pruebas.local';
  process.env.SMTP_USER = process.env.SMTP_USER || 'pruebas@milagros.local';
  process.env.SMTP_PASS = process.env.SMTP_PASS || 'clave-de-pruebas';
  process.env.SMTP_PORT = process.env.SMTP_PORT || '587';

  return {
    dir,
    dbPath,
    // Cierra la conexión SQLite (libera el archivo, incluidos los
    // sidecars -wal/-shm de modo WAL) y borra toda la carpeta temporal. Se
    // debe llamar en un after()/afterEach() del archivo de prueba.
    limpiar() {
      try {
        require('../../src/data/db').close();
      } catch (error) {
        // Si ningún módulo llegó a requerir db.js en este archivo, no hay
        // conexión que cerrar — no es un error real.
      }
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

module.exports = { crearBaseDeDatosTemporal };
