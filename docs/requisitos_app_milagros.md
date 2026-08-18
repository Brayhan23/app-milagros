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

## Pendientes antes de entregar al cliente

- [ ] Reemplazar usuario admin de pruebas por el usuario real del negocio
- [ ] Configurar correo real del admin (para recuperación de contraseña)
- [ ] Configurar datos reales de la empresa en configuracion_empresa (nombre, NIT, dirección, teléfono, correo, logo)
- [ ] Configurar BACKUP_PATH apuntando a la carpeta real de Google Drive Desktop del cliente
- [ ] Instalar Google Drive Desktop en el PC del cliente
- [ ] Configurar SMTP con la cuenta de correo real del negocio (no la cuenta de pruebas del desarrollador)
- [ ] Empaquetar la app como ejecutable (pkg/nexe) para no requerir Node.js instalado en el PC del cliente
- [ ] Configurar inicio automático con Windows
- [ ] Verificar backup real funcionando end-to-end en el PC del cliente, no solo en desarrollo
- [ ] Borrar cualquier usuario, producto, cliente o venta de prueba antes de la entrega
- [ ] Confirmar con el cliente el porcentaje de IVA aplicable a sus productos (si quedó configurable)