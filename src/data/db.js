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

if (!dbExistia) {
  const schemaPath = path.join(__dirname, '..', 'config', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);
  console.log(`Base de datos creada en ${dbPath} a partir de schema.sql`);
}

module.exports = db;
