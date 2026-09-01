// Uso en desarrollo:  node scripts/crear-admin.js <usuario> <password>
// Uso empaquetado:    app-milagros.exe crear-admin <usuario> <password>
const bcrypt = require('bcrypt');
const usuariosRepo = require('../src/data/usuariosRepo');

const SALT_ROUNDS = 12;

// Recibe los argumentos ya recortados (sin "node script.js" ni "crear-admin"
// adelante) para poder reusarse desde server.js con el offset correcto sin
// duplicar esta lógica — ver COMANDOS_CLI en server.js.
function main(args) {
  const [usuario, password] = args;

  if (!usuario || !password) {
    console.error('Uso:');
    console.error('  app-milagros.exe crear-admin <usuario> <password>   (PC del cliente)');
    console.error('  node scripts/crear-admin.js <usuario> <password>    (desarrollo)');
    process.exit(1);
  }

  if (usuariosRepo.buscarPorUsuario(usuario)) {
    console.error(`El usuario "${usuario}" ya existe.`);
    process.exit(1);
  }

  const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);
  const creado = usuariosRepo.crearUsuario({ usuario, passwordHash });

  console.log(`Usuario administrador creado: id=${creado.id}, usuario=${creado.usuario}`);
  process.exit(0);
}

module.exports = main;

if (require.main === module) {
  main(process.argv.slice(2));
}
