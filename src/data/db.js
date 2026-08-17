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

// Migraciones puntuales: CREATE TABLE IF NOT EXISTS no puede agregar una
// columna a una tabla que ya existe, así que una BD creada antes de HU-11
// (con la tabla `ventas` ya presente pero sin `cliente_id`) se queda atrás.
// Se corrige con un ALTER TABLE explícito, protegido por PRAGMA table_info
// para que sea idempotente y no falle en arranques posteriores ni en una BD
// nueva (donde schema.sql ya crea la columna y aquí no hay nada que hacer).
// Probado contra una copia real de la BD de este proyecto antes de aplicarlo.
function columnaExiste(tabla, columna) {
  return db
    .prepare(`PRAGMA table_info(${tabla})`)
    .all()
    .some((columnaInfo) => columnaInfo.name === columna);
}

if (!columnaExiste('ventas', 'cliente_id')) {
  db.exec('ALTER TABLE ventas ADD COLUMN cliente_id INTEGER REFERENCES clientes(id)');
  console.log('Migración aplicada: ventas.cliente_id agregada (HU-11/HU-12/HU-13).');
}

// HU-14: mismo patrón que cliente_id arriba. venta_items.precio_compra_unitario
// no existía antes de los reportes de ganancia; en una BD ya creada, el
// CREATE TABLE IF NOT EXISTS de arriba no le agrega la columna a la tabla
// existente. Queda NULL para las filas viejas (no hay forma de reconstruir
// un costo histórico que nunca se guardó) — reportesRepo.js lo aproxima con
// el precio_compra actual del producto para esos casos.
if (!columnaExiste('venta_items', 'precio_compra_unitario')) {
  db.exec('ALTER TABLE venta_items ADD COLUMN precio_compra_unitario INTEGER CHECK (precio_compra_unitario >= 0)');
  console.log('Migración aplicada: venta_items.precio_compra_unitario agregada (HU-14).');
}

// Requisito adicional (recuperación de contraseña): usuarios ya creados
// antes de esta historia (ej. el admin de scripts/crear-admin.js) no tienen
// correo. Mismo patrón guardado que las migraciones anteriores.
if (!columnaExiste('usuarios', 'correo')) {
  db.exec('ALTER TABLE usuarios ADD COLUMN correo TEXT');
  console.log('Migración aplicada: usuarios.correo agregada (recuperación de contraseña).');
}

module.exports = db;