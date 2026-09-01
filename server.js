const fs = require('fs');
const path = require('path');
const { salirConError } = require('./src/config/salidaFatal');

// Sin esto, faltar el .env no falla acá: cada módulo que lee process.env.X
// sigue su propio camino (algunos tienen default, otros solo imprimen una
// advertencia — ver BACKUP_PATH en backupService.js), y el síntoma real
// termina apareciendo minutos u horas después, lejos de la causa. Revisarlo
// una sola vez, acá, apenas arranca, evita ese diagnóstico a ciegas.
const RUTA_ENV = path.join(process.cwd(), '.env');
if (!fs.existsSync(RUTA_ENV)) {
  salirConError([
    'No se encontró el archivo de configuración ".env" en esta carpeta.',
    '',
    `Se esperaba encontrarlo en: ${RUTA_ENV}`,
    '',
    'Copiá el archivo ".env.example" (que viene junto al programa), renombrá',
    'la copia a ".env" y completá los datos (carpeta de respaldos, correo,',
    'etc.) antes de iniciar la aplicación.',
  ]);
}

require('dotenv').config();

// Subcomandos de mantenimiento que en desarrollo se ejecutan con
// "node scripts/xxx.js" (requiere Node instalado). El PC del cliente no
// tiene Node — este mismo .exe hace también de esas herramientas cuando se
// lo llama con uno de estos nombres como primer argumento, ej.:
//   app-milagros.exe crear-admin usuario contraseña
// Cada script exporta una función (args) en vez de leer process.argv directo,
// para poder reusarla acá con el offset correcto sin duplicar su lógica.
//
// Los tres require() de abajo van con la ruta escrita literal a propósito
// (nada de un mapa nombre->ruta con require(mapa[comando])): pkg arma el
// ejecutable analizando el código en busca de require() con un texto fijo,
// así que un require calculado en tiempo de ejecución no lo detecta y ese
// archivo queda afuera del .exe en silencio.
const COMANDOS_CLI = ['crear-admin', 'configurar-correo', 'verificar-backup'];
const comando = process.argv[2];

if (comando === 'crear-admin') {
  require('./scripts/crear-admin')(process.argv.slice(3));
} else if (comando === 'configurar-correo') {
  require('./scripts/configurar-correo')(process.argv.slice(3));
} else if (comando === 'verificar-backup') {
  require('./scripts/verificar-backup')(process.argv.slice(3));
} else if (comando) {
  console.error(`Comando desconocido: "${comando}".`);
  console.error(`Comandos disponibles: ${COMANDOS_CLI.join(', ')}.`);
  console.error('Sin ningún comando, este mismo programa inicia el servidor normalmente.');
  process.exit(1);
} else {
  iniciarServidor();
}

function iniciarServidor() {
  let express, requiereSesion;
  let authRoutes, backupRoutes, backupService, mantenimientoService;
  let productosRoutes, ventasRoutes, clientesRoutes, configuracionRoutes, reportesRoutes, auditoriaRoutes, auditoriaService;

  // Cualquier cosa acá abajo puede reventar por una razón de instalación (un
  // archivo que quedó afuera al empaquetar, un addon nativo que no coincide
  // con la versión de Node, una base de datos dañada) — sin este try/catch,
  // eso se ve como un stack trace en inglés y la ventana se cierra sola.
  try {
    express = require('express');
    requiereSesion = require('./src/routes/middlewares/requiereSesion');
    authRoutes = require('./src/routes/authRoutes');
    backupRoutes = require('./src/routes/backupRoutes');
    backupService = require('./src/domain/backupService');
    mantenimientoService = require('./src/domain/mantenimientoService');
    productosRoutes = require('./src/routes/productosRoutes');
    ventasRoutes = require('./src/routes/ventasRoutes');
    clientesRoutes = require('./src/routes/clientesRoutes');
    configuracionRoutes = require('./src/routes/configuracionRoutes');
    reportesRoutes = require('./src/routes/reportesRoutes');
    auditoriaRoutes = require('./src/routes/auditoriaRoutes');
    auditoriaService = require('./src/domain/auditoriaService');
  } catch (error) {
    salirConError([
      'La aplicación no pudo iniciarse por un error interno:',
      '',
      error.message,
      '',
      'Si esto pasa justo después de instalar o actualizar el programa, la',
      'instalación puede estar incompleta — revisá que todos los archivos de',
      'la carpeta de instalación sigan ahí (el .exe, los .node, el .env).',
    ]);
    return;
  }

  const app = express();

  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'src', 'public')));

  // El logo de la empresa es un dato de la usuaria (lo coloca quien instala,
  // no viaja con el código empaquetado), así que se sirve desde una carpeta
  // real en disco junto al ejecutable (process.cwd()), no desde src/public.
  // Mismo criterio que DB_PATH/LOGS_PATH/BACKUP_PATH. Se crea sola si todavía
  // no existe, igual que data/ y logs/.
  const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  app.use('/uploads', express.static(UPLOADS_DIR));

  // POST /api/auth/login es la única ruta pública; todo lo demás bajo /api exige sesión.
  app.use('/api/auth', authRoutes);
  app.use('/api', requiereSesion, productosRoutes);
  app.use('/api', requiereSesion, ventasRoutes);
  app.use('/api', requiereSesion, clientesRoutes);
  app.use('/api', requiereSesion, configuracionRoutes);
  app.use('/api', requiereSesion, reportesRoutes);
  app.use('/api', requiereSesion, auditoriaRoutes);
  app.use('/api', requiereSesion, backupRoutes);

  // Red de seguridad adicional: si una ruta deja escapar una excepción no
  // atrapada (ej. un valor que pasó las validaciones de negocio pero rompe al
  // hacer bind en better-sqlite3), esto evita que tumbe el proceso completo
  // de Node — responde 500 genérico y el servidor sigue sirviendo el resto de
  // las requests. No reemplaza las validaciones de cada dominio, es un
  // respaldo para lo que se les escape. Debe registrarse después de todas las
  // rutas: Express solo lo invoca cuando algo aguas arriba llama a next(err)
  // o lanza una excepción.
  app.use((err, req, res, next) => {
    console.error('Error no controlado en una ruta:', err);
    res.status(500).json({ exito: false, mensaje: 'Ocurrió un error inesperado en el servidor.' });
  });

  const PORT = process.env.PORT || 3000;
  const HOST = '127.0.0.1';
  // La app es local-first: corre en el PC de la tienda y no debería ser
  // alcanzable desde otros equipos de la misma red. Sin fijar el host,
  // app.listen(PORT) escucha por defecto en todas las interfaces (0.0.0.0),
  // lo que la expone a cualquier dispositivo en la misma WiFi/LAN — más allá
  // de lo que asume el resto del proyecto ("solo localhost"). Atar el
  // servidor a 127.0.0.1 hace que solo procesos del propio PC puedan
  // conectarse.
  app.listen(PORT, HOST, () => {
    console.log(`Servidor corriendo en http://${HOST}:${PORT}`);
    backupService.iniciarProgramacionBackup();
    auditoriaService.iniciarProgramacionPurga();
    mantenimientoService.iniciarProgramacionVacuum();
  });
}
