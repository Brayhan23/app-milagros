require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.resolve(process.cwd(), process.env.DB_PATH || './data/milagros.db');
const dbExistia = fs.existsSync(dbPath);

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// schema.sql solo usa CREATE TABLE IF NOT EXISTS, así que aplicarlo en cada
// arranque es idempotente: no toca las tablas ni los datos que ya existen,
// y crea las tablas nuevas que se hayan agregado (ej. HU-02 sobre una BD
// que ya tenía usuarios). Así una BD existente en el PC del cliente se
// mantiene al día con el esquema sin perder nada de lo que ya tenía.
const schemaPath = path.join(__dirname, '..', 'config', 'schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');
db.exec(schema);

if (!dbExistia) {
  console.log(`Base de datos creada en ${dbPath} a partir de schema.sql`);
}

module.exports = db;


// const path = require('path');
// const Database = require('better-sqlite3');

// // Ruta hacia el archivo de base de datos en la raíz del proyecto
// const dbPath = path.resolve(__dirname, '../../milagros.db');

// // Crear/conectar a la base de datos SQLite
// const db = new Database(dbPath, {
//   // verbose: console.log // Descomenta esta línea si deseas ver las consultas SQL en consola
// });

// // Habilitar claves foráneas en SQLite
// db.pragma('foreign_keys = ON');

// // --- INICIALIZACIÓN DE LA BASE DE DATOS ---

// // Tabla de Usuarios (Épica 1: HU-01)
// db.exec(`
//   CREATE TABLE IF NOT EXISTS usuarios (
//     id INTEGER PRIMARY KEY AUTOINCREMENT,
//     usuario TEXT NOT NULL UNIQUE,
//     password_hash TEXT NOT NULL,
//     rol TEXT DEFAULT 'general',
//     intentos_fallidos INTEGER DEFAULT 0,
//     bloqueado_hasta DATETIME DEFAULT NULL,
//     creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
//   );
// `);

// // Tabla de Productos e Inventario (Épica 2: HU-02 a HU-05)
// db.exec(`
//   CREATE TABLE IF NOT EXISTS productos (
//     id INTEGER PRIMARY KEY AUTOINCREMENT,
//     codigo_barras TEXT UNIQUE,
//     nombre TEXT NOT NULL,
//     descripcion TEXT,
//     precio_compra INTEGER NOT NULL DEFAULT 0,
//     precio_detal INTEGER NOT NULL DEFAULT 0,
//     precio_mayor INTEGER NOT NULL DEFAULT 0,
//     stock_actual INTEGER NOT NULL DEFAULT 0,
//     stock_minimo INTEGER NOT NULL DEFAULT 0,
//     activo INTEGER NOT NULL DEFAULT 1,
//     creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
//     actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
//   );
// `);

// module.exports = db;