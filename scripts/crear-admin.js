// Uso: node scripts/crear-admin.js <usuario> <password>
const bcrypt = require('bcrypt');
const usuariosRepo = require('../src/data/usuariosRepo');

const SALT_ROUNDS = 10;

function main() {
  const [usuario, password] = process.argv.slice(2);

  if (!usuario || !password) {
    console.error('Uso: node scripts/crear-admin.js <usuario> <password>');
    process.exit(1);
  }

  if (usuariosRepo.buscarPorUsuario(usuario)) {
    console.error(`El usuario "${usuario}" ya existe.`);
    process.exit(1);
  }

  const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);
  const creado = usuariosRepo.crearUsuario({ usuario, passwordHash });

  console.log(`Usuario administrador creado: id=${creado.id}, usuario=${creado.usuario}`);
}

main();
