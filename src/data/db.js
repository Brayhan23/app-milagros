require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.resolve(process.cwd(), process.env.DB_PATH || './data/milagros.db');
const dbExistia = fs.existsSync(dbPath);

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

// better-sqlite3 localiza su addon nativo (.node) por su cuenta vía el
// paquete "bindings", que busca en rutas relativas a node_modules — dentro de
// un ejecutable empaquetado (pkg) esas rutas caen dentro del snapshot de solo
// lectura del binario, donde no hay un archivo .node real que se pueda
// dlopen(). La propia librería expone una salida oficial para esto: la
// opción "nativeBinding" acepta una ruta absoluta y la usa en vez de
// "bindings". Se apunta al .node que "npm run build" deja suelto junto al
// .exe (ver scripts/build.js) — process.pkg solo existe corriendo empaquetado,
// así que en desarrollo esto no cambia nada.
const nativeBindingPath = process.pkg ? path.join(path.dirname(process.execPath), 'better_sqlite3.node') : undefined;

const db = new Database(dbPath, nativeBindingPath ? { nativeBinding: nativeBindingPath } : undefined);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// schema.sql solo usa CREATE TABLE IF NOT EXISTS, así que aplicarlo en cada
// arranque es idempotente: no toca las tablas ni los datos que ya existen,
// y crea las tablas nuevas que se hayan agregado (ej. HU-02 sobre una BD
// que ya tenía usuarios). Así una BD existente en el PC del cliente se
// mantiene al día con el esquema sin perder nada de lo que ya tenía.
// __dirname (no process.cwd()) es correcto acá a propósito: schema.sql es
// parte del CÓDIGO de la app (viaja con el bundle), no un dato de la
// usuaria — a diferencia de DB_PATH/LOGS_PATH, que deben resolverse contra
// la carpeta de instalación real, no contra dónde vive el código fuente.
// Si el día de mañana esto corre empaquetado (pkg), este archivo tiene que
// quedar declarado explícitamente como asset del paquete para que el
// snapshot lo incluya; si no, esta misma línea revienta acá con un mensaje
// claro en vez de un stack trace críptico.
const schemaPath = path.join(__dirname, '..', 'config', 'schema.sql');
let schema;
try {
  schema = fs.readFileSync(schemaPath, 'utf8');
} catch (error) {
  throw new Error(
    `No se pudo leer schema.sql en "${schemaPath}" (${error.message}). ` +
      'La instalación puede estar incompleta o dañada — si esto corre desde un ejecutable empaquetado, ' +
      'confirmar que schema.sql quedó incluido como asset del paquete.'
  );
}
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

// Requisito adicional (IVA en la factura). Dos columnas nuevas en tablas que
// ya existían: el % general del negocio (con default 19, la tarifa general
// colombiana, como punto de partida) y la "foto" por venta de qué tasa
// estaba vigente al momento de vender. Mismo patrón guardado de siempre.
if (!columnaExiste('configuracion_empresa', 'iva_porcentaje')) {
  db.exec(
    'ALTER TABLE configuracion_empresa ADD COLUMN iva_porcentaje INTEGER NOT NULL DEFAULT 19 CHECK (iva_porcentaje BETWEEN 0 AND 100)'
  );
  console.log('Migración aplicada: configuracion_empresa.iva_porcentaje agregada (IVA en factura).');
}

if (!columnaExiste('ventas', 'iva_porcentaje')) {
  db.exec('ALTER TABLE ventas ADD COLUMN iva_porcentaje INTEGER CHECK (iva_porcentaje BETWEEN 0 AND 100)');
  console.log('Migración aplicada: ventas.iva_porcentaje agregada (IVA en factura).');
}

module.exports = db;