// Uso: node scripts/configurar-correo.js <usuario> <correo>
const usuariosRepo = require('../src/data/usuariosRepo');

const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function main() {
  const [usuario, correo] = process.argv.slice(2);

  if (!usuario || !correo) {
    console.error('Uso: node scripts/configurar-correo.js <usuario> <correo>');
    process.exit(1);
  }

  if (!REGEX_CORREO.test(correo)) {
    console.error(`"${correo}" no parece un correo válido.`);
    process.exit(1);
  }

  const registro = usuariosRepo.buscarPorUsuario(usuario);
  if (!registro) {
    console.error(`El usuario "${usuario}" no existe.`);
    process.exit(1);
  }

  const actualizado = usuariosRepo.actualizarCorreo(registro.id, correo);
  console.log(`Correo actualizado: usuario=${actualizado.usuario}, correo=${actualizado.correo}`);
}

main();
