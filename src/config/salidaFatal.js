// Punto único para reportar un error que impide arrancar la aplicación (falta
// de configuración, un archivo esperado que no está, un addon nativo que no
// carga, etc.). Dos problemas que resuelve, pensando en que quien instala la
// app en el PC del cliente puede no ser una persona técnica:
//
// 1. Un error sin atrapar en Node imprime un stack trace en inglés lleno de
//    rutas internas — no dice qué hacer. Acá el mensaje es siempre texto
//    claro y accionable en español.
// 2. Si la app corre empaquetada (pkg) y alguien la abrió con doble clic (no
//    desde una consola que ya tenían abierta), la ventana de consola que pkg
//    abre se cierra sola apenas el proceso termina — un error fatal sería
//    ilegible porque desaparece en el mismo instante en que aparece. Por eso,
//    solo en ese caso, se espera a que la persona presione una tecla antes de
//    cerrar. "pause" es un comando de cmd.exe, no un ejecutable aparte, así
//    que corre sin depender de nada más que ya tenga el PC.
function salirConError(lineas) {
  console.error('');
  console.error('========================================================');
  for (const linea of lineas) console.error(linea);
  console.error('========================================================');

  if (process.pkg) {
    console.error('');
    try {
      require('child_process').execSync('pause', { stdio: 'inherit', shell: true });
    } catch (_) {
      // Si "pause" no está disponible por algún motivo, no hay forma de
      // mantener la ventana abierta — no vale la pena bloquear el cierre por
      // esto, el mensaje ya quedó impreso arriba.
    }
  }

  process.exit(1);
}

module.exports = { salirConError };
