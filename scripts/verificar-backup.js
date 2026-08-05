// Uso: node scripts/verificar-backup.js [ruta-al-backup.db]
// Sin argumento, verifica el respaldo más reciente en BACKUP_PATH.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function backupMasReciente(carpeta) {
  const patron = /-(\d{4}-\d{2}-\d{2})\.db$/;
  const archivos = fs
    .readdirSync(carpeta)
    .filter((nombre) => patron.test(nombre))
    .sort((a, b) => b.match(patron)[1].localeCompare(a.match(patron)[1]));

  return archivos[0] ? path.join(carpeta, archivos[0]) : null;
}

function main() {
  const rutaArg = process.argv[2];
  const ruta = rutaArg || (process.env.BACKUP_PATH && backupMasReciente(process.env.BACKUP_PATH));

  if (!ruta || !fs.existsSync(ruta)) {
    console.error('No se encontró un archivo de respaldo para verificar.');
    process.exit(1);
  }

  console.log(`Verificando: ${ruta}`);
  console.log(`Tamaño: ${fs.statSync(ruta).size} bytes`);

  let db;
  try {
    db = new Database(ruta, { readonly: true, fileMustExist: true });
  } catch (error) {
    console.error(`No se pudo abrir el archivo como base de datos SQLite: ${error.message}`);
    process.exit(1);
  }

  let codigoSalida = 0;
  try {
    const resultado = db.pragma('integrity_check');
    const ok = resultado.length === 1 && resultado[0].integrity_check === 'ok';
    console.log(`integrity_check: ${ok ? 'OK' : JSON.stringify(resultado)}`);

    if (!ok) {
      console.error('El respaldo está corrupto.');
      codigoSalida = 1;
    } else {
      const tablas = db.prepare('SELECT count(*) AS total FROM sqlite_master').get();
      console.log(`Objetos legibles en sqlite_master: ${tablas.total}`);
      console.log('Respaldo válido y restaurable.');
    }
  } catch (error) {
    console.error(`Error al verificar el respaldo: ${error.message}`);
    codigoSalida = 1;
  } finally {
    db.close();
  }

  process.exit(codigoSalida);
}

main();
