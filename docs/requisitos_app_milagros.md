# Especificación — App Milagros

## Arquitectura

- Backend: Node.js + Express
- Base de datos: SQLite (better-sqlite3)
- Frontend: HTML/CSS/JS servido en localhost, sin Electron
- Estructura en capas:
  - `src/domain` — lógica de negocio pura
  - `src/data` — repositorios (acceso a SQLite)
  - `src/routes` — rutas/API
  - `public/` — frontend
- Despliegue: local-first en el PC del cliente. La app debe funcionar sin conexión a internet.
- Backup: copia automática diaria del archivo de base de datos hacia almacenamiento en la nube. Requisito crítico, no romper esta lógica sin avisar.

## Reglas del proyecto (no negociables)

- No implementar facturación electrónica DIAN. Fuera de alcance por ahora.
- Contraseñas siempre con hash (bcrypt), nunca texto plano.
- Consultas SQL siempre parametrizadas, nunca concatenadas.
- `.env` y archivos `*.db` nunca se commitean a git.
- No modificar la lógica de backup sin confirmarlo antes.

---

## Historias de usuario

### Épica 1 — Autenticación

**HU-01**
Como usuario, quiero iniciar sesión con un usuario y una contraseña general, para proteger el acceso al sistema.
- Un único rol de acceso ("general").
- Bloqueo temporal tras varios intentos fallidos.
- Contraseña almacenada con hash, nunca en texto plano.

---

### Épica 2 — Gestión de productos e inventario

**HU-02**
Como usuario, quiero registrar productos con su código de barras, para identificarlos al vender.

**HU-03**
Como usuario, quiero que el stock se actualice cada vez que llegan productos nuevos, para mantener el inventario correcto.

**HU-04**
Como usuario, quiero recibir una alerta cuando un producto esté por agotarse, para reabastecer a tiempo.

**HU-05**
Como usuario, quiero ver el stock disponible en tiempo real, para saber qué puedo vender.

---

### Épica 3 — Ventas y facturación

**HU-06**
Como usuario, quiero generar una factura física por cada venta, para entregar un comprobante al cliente.

**HU-07**
Como usuario, quiero enviar una copia de la factura por correo electrónico (sin timbrado DIAN), para clientes que la prefieran digital.

**HU-08**
Como usuario, quiero aplicar descuentos a una venta, para promociones o negociación con el cliente.

**HU-09**
Como usuario, quiero registrar el método de pago (efectivo, transferencia o crédito), para controlar cómo se cobró cada venta.

**HU-10**
Como usuario, quiero diferenciar precio al detal y precio al por mayor, para vender correctamente según el tipo de cliente.

---

### Épica 4 — Clientes y créditos

**HU-11**
Como usuario, quiero registrar clientes mayoristas, para llevar su historial y condiciones especiales.

**HU-12**
Como usuario, quiero registrar ventas a crédito y las deudas asociadas, para saber cuánto me debe cada cliente.

**HU-13**
Como usuario, quiero ver una lista de clientes con deudas pendientes, para gestionar los cobros.
- Si una deuda tiene más de 30 días desde la fecha de la venta sin saldarse completamente, debe mostrarse una advertencia visual en el listado de deudores.

---

### Épica 5 — Reportes

**HU-14**
Como usuario, quiero ver las ventas del día y la ganancia generada, para conocer el rendimiento diario.

**HU-15**
Como usuario, quiero consultar el histórico de ventas por rango de fechas, para analizar el negocio periódicamente.

**HU-16**
Como usuario, quiero ver un reporte de productos más vendidos, para decidir qué reabastecer con prioridad.

---

### Épica 6 — Configuración y marca

**HU-17**
Como usuario, quiero que la interfaz use los colores de la marca (rosado, lila, verde menta), para reflejar la identidad visual de Milagros.

**HU-18**
Como usuario, quiero configurar los datos de la empresa (nombre, NIT, dirección, logo), para que aparezcan en el encabezado de cada factura.

---

## Requisitos adicionales

- Recuperación de contraseña.
- Registro de auditoría (quién hizo cada venta/cambio de stock).
- Exportar reportes a PDF/Excel.
- Soporte para impresora térmica en facturas físicas.
- Configuración de IVA en la factura.
- Modo sin conexión (offline).
- Diseño de roles ampliable a futuro (aunque hoy solo existe un login general).

---

## Procedimiento de restauración de backup

**Para usar si el PC de la tienda falló, se perdió, o el archivo de la base de
datos se corrompió.** Seguí estos pasos en orden, tal cual — no hace falta
entender el código, solo copiar archivos y arrancar la app.

**Antes de empezar**, ubicá dos carpetas:
- La carpeta del proyecto (donde está `data/milagros.db`).
- La carpeta de backups: la que está configurada en `BACKUP_PATH` en el
  archivo `.env` — en el PC del cliente, esto es la carpeta sincronizada por
  Google Drive Desktop (algo como `Google Drive\MilagrosBackups`).

### Paso 1 — Cerrar la app

Si la app está corriendo (ventana de terminal abierta, o el ícono en la
bandeja del sistema), cerrala por completo. Si no estás seguro de que cerró
del todo, reiniciá el PC.

### Paso 2 — Elegir el backup a usar

Andá a la carpeta de backups. Vas a ver archivos con nombre
`milagros-AAAA-MM-DD.db` (uno por día, hasta 30 días guardados). Elegí el
más reciente — la fecha más alta que veas.

**Importante**: cualquier venta, abono o cambio hecho DESPUÉS de la fecha de
ese archivo **se va a perder** — el backup solo tiene los datos hasta el día
en que se generó. Si la app llegó a andar hoy antes de fallar, esos datos de
hoy no van a estar en el backup de ayer.

### Paso 3 — Guardar aparte el archivo actual (por las dudas)

En la carpeta del proyecto, dentro de `data/`, buscá el archivo
`milagros.db` (y si aparecen `milagros.db-wal` o `milagros.db-shm` al lado,
son parte del mismo archivo, van juntos). Si todavía existe y se puede
copiar, **no lo borres** — renombralo agregándole `-roto` al nombre (ej.
`milagros.db-roto`) y sacalo de la carpeta `data/` a otro lado. Así, si algo
sale mal más adelante, no se perdió nada.

### Paso 4 — Poner el backup en su lugar

Copiá el archivo de backup que elegiste en el Paso 2 hacia la carpeta
`data/` del proyecto, y renombralo exactamente a `milagros.db` (sin la
fecha, sin `.db` duplicado). Si quedaron `milagros.db-wal` o
`milagros.db-shm` de la versión rota en esa carpeta, borralos — son basura
de la versión anterior y no le sirven al archivo nuevo.

La carpeta `data/` debe quedar con un solo archivo: `milagros.db` (el que
acabás de copiar).

### Paso 5 — Arrancar la app normalmente

Abrí la app como siempre (`npm start`, o el acceso directo si ya está
empaquetada). Debería arrancar sin errores raros en la ventana que se abre.

### Paso 6 — Confirmar que todo está bien

Antes de dar por terminada la restauración, revisá esto en la app:

1. **Iniciar sesión** con el usuario de siempre.
2. **Ver productos** (pestaña de inventario): que aparezcan los productos
   esperados, con el stock que tenían para la fecha del backup.
3. **Ver ventas** (historial de facturas): que las ventas viejas estén ahí.
4. **Ver clientes con deuda** (pestaña de créditos/deudas): que los saldos
   pendientes coincidan con lo que se esperaba para esa fecha.

Si las cuatro cosas se ven bien, la restauración funcionó. Si algo se ve
vacío o raro, **no sigas usando esa base** — volvé a poner el archivo que
guardaste en el Paso 3 (`milagros.db-roto`, renombrado de vuelta a
`milagros.db`) y pedí ayuda antes de seguir.

### Notas para quien esté armando el backup o revisando que funcione bien

- Antes de un incidente real, se puede verificar que un backup específico
  esté sano (sin abrir la app) con: `npm run verificar-backup -- "ruta al
  archivo .db"`. Sin ese argumento, revisa el más reciente en `BACKUP_PATH`.
- Si la app estaba corriendo en modo WAL (normal) y quedan archivos
  `milagros.db-wal`/`milagros.db-shm` junto al `.db` restaurado que NO
  vinieron del backup, hay que borrarlos — son del archivo anterior y no
  corresponden al nuevo `.db`, mezclarlos puede corromper la base.
- Este procedimiento fue probado de punta a punta (simulacro real: parar el
  servidor, reemplazar el archivo, arrancar, verificar login/productos/
  ventas/deudas) como parte de la auditoría de infraestructura de datos.

---

## Empaquetado y despliegue

### Estructura de carpetas en el PC del cliente

Todo lo que la app necesita ESCRIBIR debe vivir separado de todo lo que es
código — así una actualización (reemplazar el ejecutable) nunca puede pisar
datos, y un backup solo necesita respaldar una carpeta, no medio Program
Files. Estructura propuesta:

```
C:\AppMilagros\                    (carpeta de instalación, elegida al instalar)
├── app-milagros.exe               ← se REEMPLAZA en cada actualización
├── better_sqlite3.node            ← addon nativo, junto al exe (ver más abajo)
├── prebuilds\win32-x64\
│   └── bcrypt.node                ← addon nativo, junto al exe (ver más abajo)
├── .env                           ← configuración local — NUNCA se toca al actualizar
├── iniciar.bat                    ← lanzador para el inicio automático (ver punto 4)
├── data\
│   └── milagros.db                ← la BD real — persiste entre actualizaciones
├── logs\
│   ├── backup.log
│   └── ultimo-vacuum.txt
└── uploads\
    └── logo.png                   ← logo de la empresa (dato de la usuaria, no código)

C:\Users\<usuario>\Google Drive\MilagrosBackups\   ← BACKUP_PATH, fuera de C:\AppMilagros\ a propósito
├── milagros-2026-08-01.db
├── milagros-2026-08-02.db
└── ...
```

(Todo esto lo genera `npm run build` en `dist\` — ver "Hallazgos..." abajo para
el detalle de por qué `bcrypt.node` queda en una subcarpeta `prebuilds\win32-x64\`
en vez de junto al .exe como `better_sqlite3.node`, y `docs/instalacion.md`
para el procedimiento de instalación paso a paso.)

Reglas de esta estructura:
- **`data\` y `logs\` van AL LADO del ejecutable, no dentro de ninguna carpeta
  de código.** Ya son escritos usando `process.cwd()` (no `__dirname`), así
  que basta con que `iniciar.bat` arranque el `.exe` desde `C:\AppMilagros\`
  para que todo caiga en el lugar correcto — ver el punto 4 sobre por qué el
  `.bat` debe fijar el directorio de trabajo explícitamente en vez de
  confiar en el comportamiento por defecto de Windows.
- **`BACKUP_PATH` vive deliberadamente FUERA de `C:\AppMilagros\`**, en la
  carpeta sincronizada por Google Drive Desktop: si `C:\AppMilagros\`
  entero se corrompe o el disco falla, los backups no deben estar en el
  mismo lugar que lo que se dañó.
- **`uploads\` también queda fuera del ejecutable** (ver hallazgo de
  empaquetado más abajo — hoy vive mezclada con el código en
  `src/public/uploads/`, algo que hay que resolver como parte del propio
  trabajo de empaquetado, no antes).

### Hallazgos de la revisión de compatibilidad con `pkg` (2026-08-24)

Se revisó código por código si algo se rompería al empaquetar. Dos
correcciones de código genuinas ya se hicieron (no dependen de cómo se
configure el empaquetado, eran conceptualmente incorrectas de todas formas):

- **Corregido**: `backupService.js` y `mantenimientoService.js` calculaban
  la ruta de `logs/` con `__dirname` (relativo al código fuente). Dentro de
  un ejecutable `pkg`, `__dirname` apunta a una ruta virtual DENTRO del
  snapshot de solo lectura — escribir ahí falla en silencio. Se cambió a
  `process.cwd()` (mismo criterio que ya usaba `DB_PATH`), y se agregó
  `LOGS_PATH` a `.env`/`.env.example` para que sea configurable igual que
  `BACKUP_PATH`. Verificado con servidor real: arranca sin errores, backup
  y log siguen escribiendo donde deben.
- **Corregido**: la lectura de `schema.sql` en `db.js` no tenía manejo de
  error — si el archivo faltara (justo el síntoma de un empaquetado que
  olvidó incluirlo como asset), tiraba un stack trace críptico. Ahora falla
  con un mensaje claro que dice explícitamente que revisar los assets del
  paquete si esto corre empaquetado.

Hallazgos, ya **resueltos** como parte del propio trabajo de empaquetado
(2026-08-29):

- ✅ **Los dos addons nativos (`better-sqlite3`, `bcrypt`) son archivos
  `.node` compilados** — `pkg` NO puede meterlos dentro del snapshot de
  JavaScript, así que se cargan explícitamente desde afuera, cada uno con
  su propio mecanismo (ninguno quedó librado a la detección automática de
  `pkg`, que para estos dos casos específicos no funciona: son
  `require()` calculados en tiempo de ejecución, no un string literal):
  - `better-sqlite3` acepta oficialmente una ruta explícita vía la opción
    `nativeBinding` de su constructor — `src/data/db.js` la usa apuntando a
    `better_sqlite3.node` junto al `.exe` cuando `process.pkg` existe (en
    desarrollo, sin `process.pkg`, sigue igual que siempre).
  - `bcrypt` no tiene un equivalente a `nativeBinding`, pero el cargador
    que usa por debajo (`node-gyp-build`) ya busca, sin código nuestro de
    por medio, en `prebuilds/<plataforma>-<arquitectura>/` junto al
    ejecutable que lo está corriendo — alcanza con reproducir esa misma
    carpeta (`prebuilds\win32-x64\bcrypt.node`) junto al `.exe`.
  - Ambos verificados end-to-end en un `.exe` real generado con
    `npm run build`, corriendo en esta misma máquina Windows: login (usa
    bcrypt) y todas las operaciones de base de datos (better-sqlite3)
    funcionan.
- ✅ **`pkg` (`vercel/pkg`) está sin mantenimiento desde 2023.** Se usó el
  fork mantenido por la comunidad, `@yao-pkg/pkg`, no el paquete original
  (`devDependencies` en `package.json`).
- ✅ **`pdfkit` lee archivos de fuente (`.afm`) desde disco en tiempo de
  ejecución** — declarados como asset (`node_modules/pdfkit/js/data/*.afm`
  en `pkg.assets`, `package.json`). Verificado generando un PDF real desde
  el `.exe` empaquetado.
- ✅ **`schema.sql` y todo `src/public/**` (frontend) también necesitan
  declararse como assets explícitos** — agregados a `pkg.assets`.
  Verificado: el `.exe` crea la base de datos con el esquema completo en el
  primer arranque y sirve el frontend completo.
- ✅ **Conflicto real de diseño: `src/public/uploads/` mezclaba código con
  datos de la usuaria.** El logo se movió a una carpeta `uploads/` propia,
  fuera de `src/public` (en desarrollo, en la raíz del proyecto; en el PC
  del cliente, junto al `.exe`), servida en `server.js` con su propia ruta
  estática apuntando a `process.cwd()`, no a `__dirname`. `src/public/`
  quedó libre de datos de la usuaria — todo lo que hay ahí es código.

Un detalle adicional que apareció al construir el `.exe` (no estaba en la
lista original): `pdfkit` usa por debajo la librería `fontkit`, que a su vez
trae `brotli` para soportar fuentes WOFF2 — código que `pkg` no logra
precompilar a bytecode V8. Esta app nunca carga fuentes externas (solo las
14 estándar por nombre, ej. `Helvetica`), así que ese camino nunca se
ejecuta, pero por las dudas se armó el `.exe` con `--fallback-to-source`
(ver `scripts/build.js`) para que ese archivo puntual viaje igual como texto
plano en vez de quedar afuera del paquete.

### Inicio automático con Windows

**Recomendación: un `.bat` simple en la carpeta de inicio de Windows
(`shell:startup`), no un servicio de Windows ni un instalador con NSSM/PM2.**
Motivo: el PC es de gama baja — un servicio de Windows corriendo en segundo
plano desde el arranque del sistema (antes incluso de que la usuaria inicie
sesión) consume recursos innecesarios para una app que solo se necesita
mientras la tienda está abierta, y agrega una capa de complejidad
(instalación de servicio, permisos, logs de servicio aparte) que no aporta
nada aquí — no es un servidor que deba sobrevivir reinicios sin
supervisión, es una caja registradora digital que la usuaria prende cuando
abre y podría cerrar cuando cierra.

El `.bat` debe:
- Fijar el directorio de trabajo explícitamente con `cd /d "%~dp0"` **antes**
  de lanzar el ejecutable — no asumir que Windows deja el directorio de
  trabajo correcto por defecto (varía según cómo se creó el acceso directo).
  Esto es lo que garantiza que `process.cwd()` (usado por `DB_PATH`,
  `BACKUP_PATH`, `LOGS_PATH`) resuelva siempre contra `C:\AppMilagros\`, sin
  importar cómo Windows decida lanzar el `.bat`.
- Lanzar el `.exe` y **no** abrir una ventana de consola visible permanente
  si se puede evitar (o dejarla minimizada) — la usuaria no es técnica, una
  consola negra con texto no le sirve de nada y puede asustarla si la cierra
  por error pensando que "algo se rompió".
- No necesita reintentos ni supervisión automática si se cae: para el
  volumen de esta tienda, si la app se cierra sola, es preferible que la
  usuaria lo note (no puede facturar) y reabra manualmente, a que un
  supervisor la reinicie en bucle silenciosamente mientras algo sigue mal.

Ejemplo de contenido de `iniciar.bat` (para armar cuando se haga el
empaquetado real):

```bat
@echo off
cd /d "%~dp0"
start "" /min app-milagros.exe
```

Se coloca un **acceso directo** a este `.bat` (no el `.bat` en sí) dentro de
`shell:startup`, para poder editar el `.bat` real sin tener que volver a
tocar la carpeta de inicio de Windows cada vez.

---

## Pendientes antes de entregar al cliente

**Datos y configuración**
- [ ] Reemplazar usuario admin de pruebas por el usuario real del negocio
- [ ] Configurar correo real del admin (para recuperación de contraseña)
- [ ] Configurar datos reales de la empresa en configuracion_empresa (nombre, NIT, dirección, teléfono, correo, logo)
- [ ] Confirmar con el cliente el porcentaje de IVA aplicable a sus productos (si quedó configurable)
- [ ] Borrar cualquier usuario, producto, cliente o venta de prueba antes de la entrega

**Backup y almacenamiento**
- [ ] Configurar BACKUP_PATH apuntando a la carpeta real de Google Drive Desktop del cliente (fuera de la carpeta de instalación, ver estructura de carpetas arriba)
- [ ] Instalar Google Drive Desktop en el PC del cliente
- [ ] Configurar LOGS_PATH y ESPACIO_MINIMO_GB si los defaults no aplican
- [ ] Verificar backup real funcionando end-to-end en el PC del cliente, no solo en desarrollo
- [ ] Ejecutar el simulacro de restauración (ver "Procedimiento de restauración de backup" arriba) al menos una vez en el PC real del cliente, no solo en desarrollo

**Correo**
- [ ] Configurar SMTP con la cuenta de correo real del negocio (no la cuenta de pruebas del desarrollador)

**Empaquetado (ver "Empaquetado y despliegue" arriba para el detalle de cada punto)**
- [x] Empaquetar la app con `@yao-pkg/pkg` (no `vercel/pkg`, sin mantenimiento), target Node 22 — `npm run build` (`scripts/build.js`)
- [x] Copiar los addons nativos (`better-sqlite3`, `bcrypt`) sueltos junto al `.exe` y confirmar que cargan — confirmado corriendo el `.exe` real en esta máquina (login, que usa bcrypt, y todas las operaciones de base de datos, que usan better-sqlite3, funcionaron)
- [x] Declarar `schema.sql`, `src/public/**` y las fuentes `.afm` de `pdfkit` como assets explícitos en `pkg.assets` — confirmado: el `.exe` crea la BD con el esquema completo, sirve el frontend y genera un PDF real
- [x] Resolver el conflicto de `src/public/uploads/` (separar el logo a una carpeta propia fuera del snapshot) — logo movido a `uploads/` (raíz del proyecto en desarrollo, junto al `.exe` en el cliente), servida aparte en `server.js`
- [x] Verificar que el `.exe` empaquetado escucha solo en `127.0.0.1` — confirmado con `netstat` corriendo el `.exe` real (`127.0.0.1:PUERTO ... LISTENING`, no `0.0.0.0`)
- [ ] Repetir la prueba de la pasada 1 de auditoría **desde un segundo dispositivo físico** en la misma red (celular, otro PC) contra el `.exe` corriendo en el PC del cliente — no se pudo hacer desde este entorno de desarrollo, que no tiene un segundo dispositivo a mano
- [ ] Confirmar en el PC real del cliente que no hace falta instalar Node.js — verificado aquí que el `.exe` no depende del Node del sistema en cuanto al runtime empaquetado (trae el suyo propio, target `node22-win-x64`), pero esta máquina de desarrollo sí tiene Node instalado; falta la confirmación en una máquina limpia real

**Inicio automático**
- [x] Crear `iniciar.bat` (ver contenido propuesto arriba) — listo en la raíz del proyecto y se copia solo a `dist\` con `npm run build`; falta colocar el acceso directo en `shell:startup` en el PC real del cliente (paso 5 de `docs/instalacion.md`)
- [ ] Probar reinicio completo del PC del cliente y confirmar que la app arranca sola, sin ventana de consola molesta, con los datos correctos

Procedimiento de instalación completo, paso a paso, pensado para seguirse
en el momento de instalar: `docs/instalacion.md`.