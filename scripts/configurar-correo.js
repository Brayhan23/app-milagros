// Uso en desarrollo:  node scripts/configurar-correo.js <usuario> <correo>
// Uso empaquetado:    app-milagros.exe configurar-correo <usuario> <correo>
const usuariosRepo = require('../src/data/usuariosRepo');

const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function main(args) {
  const [usuario, correo] = args;

  if (!usuario || !correo) {
    console.error('Uso:');
    console.error('  app-milagros.exe configurar-correo <usuario> <correo>   (PC del cliente)');
    console.error('  node scripts/configurar-correo.js <usuario> <correo>    (desarrollo)');
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
  process.exit(0);
}

module.exports = main;

if (require.main === module) {
  main(process.argv.slice(2));
}
