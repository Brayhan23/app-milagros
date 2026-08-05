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
