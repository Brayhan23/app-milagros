// Genera el ejecutable de Windows (dist/app-milagros.exe) y junta al lado
// todo lo que ese .exe necesita pero que pkg NO puede empaquetar dentro de
// sí mismo: los dos addons nativos (better-sqlite3, bcrypt) y los archivos
// de ejemplo/arranque que se copian a mano en el PC del cliente.
//
// Ver docs/requisitos_app_milagros.md ("Empaquetado y despliegue") para el
// razonamiento completo de por qué cada pieza va donde va.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const DIST = path.join(RAIZ, 'dist');

function paso(mensaje) {
  console.log(`\n[build] ${mensaje}`);
}

function copiar(origen, destino) {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.copyFileSync(origen, destino);
  console.log(`  copiado: ${path.relative(RAIZ, destino)}`);
}

paso('Limpiando dist/ ...');
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

paso('Compilando el ejecutable con @yao-pkg/pkg (target node22-win-x64) ...');
// --experimental-require-module: una dependencia interna de pkg (into-stream)
// se distribuye como ESM puro; sin este flag, Node 22.11 no puede hacer
// require() de un módulo ESM y pkg ni siquiera arranca. Node lo ignora sin
// error en versiones donde esto ya es estable por defecto.
const pkgBin = path.join(RAIZ, 'node_modules', '@yao-pkg', 'pkg', 'lib-es5', 'bin.js');
execFileSync(
  process.execPath,
  [
    '--experimental-require-module',
    pkgBin,
    'server.js',
    '--targets',
    'node22-win-x64',
    '--output',
    path.join(DIST, 'app-milagros.exe'),
    // fontkit (una dependencia de pdfkit para fuentes TTF/WOFF que esta app
    // no usa — solo se usan las 14 fuentes estándar por nombre, ej.
    // "Helvetica") trae internamente "brotli", cuyo código no se puede
    // precompilar a bytecode V8. Sin este flag ese archivo puntual queda
    // afuera del ejecutable; con él, se incluye igual como JS de texto plano
    // (funciona, solo pierde el precompilado — y de todas formas nunca se
    // ejecuta en esta app). Es la opción segura frente al riesgo de que algo
    // dependa de él en el futuro y quede faltante en silencio.
    '--fallback-to-source',
  ],
  { cwd: RAIZ, stdio: 'inherit' }
);

paso('Copiando los addons nativos sueltos junto al .exe ...');
// better-sqlite3: cargado por ruta explícita vía la opción "nativeBinding"
// (ver src/data/db.js) — un solo archivo, flat, junto al .exe.
copiar(
  path.join(RAIZ, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'),
  path.join(DIST, 'better_sqlite3.node')
);

// bcrypt: no tiene un equivalente a "nativeBinding" en su API, pero el
// cargador que usa por debajo (node-gyp-build) busca automáticamente, sin
// ningún código nuestro de por medio, en "prebuilds/<plataforma>-<arquitectura>/"
// junto al ejecutable que lo está corriendo (path.dirname(process.execPath))
// cuando no lo encuentra dentro del propio paquete. Reproducir exactamente
// esa carpeta (mismo nombre de archivo que trae bcrypt de fábrica) alcanza
// para que lo encuentre solo, sin tocar ninguna línea de authService.js.
copiar(
  path.join(RAIZ, 'node_modules', 'bcrypt', 'prebuilds', 'win32-x64', 'bcrypt.node'),
  path.join(DIST, 'prebuilds', 'win32-x64', 'bcrypt.node')
);

paso('Copiando archivos de apoyo para el despliegue ...');
copiar(path.join(RAIZ, '.env.example'), path.join(DIST, '.env.example'));
copiar(path.join(RAIZ, 'iniciar.bat'), path.join(DIST, 'iniciar.bat'));
copiar(path.join(RAIZ, 'docs', 'instalacion.md'), path.join(DIST, 'instalacion.md'));

const tamanioMB = (fs.statSync(path.join(DIST, 'app-milagros.exe')).size / (1024 * 1024)).toFixed(1);
paso(`Listo. dist/app-milagros.exe generado (${tamanioMB} MB).`);
console.log('Contenido de dist/:');
for (const nombre of fs.readdirSync(DIST)) {
  console.log(`  - ${nombre}`);
}
