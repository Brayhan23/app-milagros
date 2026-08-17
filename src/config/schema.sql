-- Esquema de base de datos: App Milagros
-- HU-01: Autenticación

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  -- Requisito adicional (recuperación de contraseña): correo al cual se
  -- envía el código temporal de recuperación (ver recuperacionService.js).
  -- Nullable porque usuarios ya existentes (ej. el admin creado antes de
  -- esta historia) no tienen este dato todavía; sin correo configurado no
  -- se puede enviar el código, así que solicitarRecuperacion() lo trata
  -- igual que "usuario no encontrado" (mismo mensaje genérico), nunca con
  -- un error distinto que delataría que el usuario existe pero le falta
  -- el correo.
  correo TEXT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

-- HU-02..HU-05: Productos e inventario
--
-- Precios en pesos colombianos (COP) como INTEGER, nunca REAL:
-- SQLite no tiene un tipo numérico de punto fijo. Guardar dinero en REAL
-- (punto flotante binario) arrastra errores de redondeo clásicos
-- (ej. 0.1 + 0.2 != 0.3) que con plata son inaceptables. El peso colombiano
-- ya no circula en fracciones (no hay centavos en uso), así que un entero
-- que representa pesos completos es exacto y no necesita redondeo alguno.
-- Si algún día se necesitaran fracciones de peso, la salida sería guardar
-- centavos como entero (todo x100), nunca pasar a REAL/DECIMAL.
CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Único cuando existe, pero opcional (no todos los productos traen
  -- código de fábrica). UNIQUE en SQLite trata cada NULL como distinto de
  -- los demás, así que varios productos sin código de barras conviven sin
  -- chocar contra esta restricción; solo se exige unicidad entre códigos
  -- que sí están presentes.
  codigo_barras TEXT UNIQUE,

  nombre TEXT NOT NULL,
  descripcion TEXT,

  -- Precio de compra (costo): junto a los de venta permite calcular la
  -- ganancia por producto que pide el negocio.
  precio_compra INTEGER NOT NULL CHECK (precio_compra >= 0),
  -- Precio de venta al detal.
  precio_detal INTEGER NOT NULL CHECK (precio_detal >= 0),
  -- Precio de venta al por mayor (HU-10 los usará para cobrar distinto
  -- según el tipo de cliente).
  precio_mayor INTEGER NOT NULL CHECK (precio_mayor >= 0),

  -- Cantidad disponible hoy (HU-05 la expone, HU-03 la moverá al llegar
  -- mercancía). El descuento de stock por venta es de otra historia y no
  -- se toca aquí.
  stock_actual INTEGER NOT NULL DEFAULT 0 CHECK (stock_actual >= 0),
  -- Umbral para la alerta de reabastecimiento (HU-04): se alerta cuando
  -- stock_actual <= stock_minimo.
  stock_minimo INTEGER NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),

  -- "Eliminar" un producto en realidad lo desactiva (activo = 0): así no
  -- se pierde el historial de ventas que lo haya referenciado más adelante.
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),

  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Épica 3 (HU-06, HU-08, HU-09, HU-10): Ventas y facturación
--
-- El descuento se guarda como monto fijo en pesos (no porcentaje), por la
-- misma razón que los precios de productos: evitar redondeos de punto
-- flotante en dinero.
CREATE TABLE IF NOT EXISTS ventas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo_cliente TEXT NOT NULL CHECK (tipo_cliente IN ('detal', 'mayor')),
  metodo_pago TEXT NOT NULL CHECK (metodo_pago IN ('efectivo', 'transferencia', 'credito')),
  -- Nullable: una venta al mostrador no siempre tiene cliente identificado.
  -- Obligatorio cuando metodo_pago = 'credito' (HU-12), pero esa regla NO se
  -- expresa como CHECK aquí: es una condición entre dos columnas que además
  -- rompería cualquier BD existente con ventas a crédito de prueba ya
  -- guardadas sin cliente_id. Se valida en ventasService antes de insertar.
  -- Ver src/data/db.js para cómo se agrega esta columna a una BD que ya
  -- tenía la tabla ventas creada (CREATE TABLE IF NOT EXISTS no puede
  -- agregar columnas a una tabla existente).
  cliente_id INTEGER REFERENCES clientes(id),
  descuento INTEGER NOT NULL DEFAULT 0 CHECK (descuento >= 0),
  subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
  total INTEGER NOT NULL CHECK (total >= 0),
  -- Requisito adicional (IVA): "foto" del configuracion_empresa.iva_porcentaje
  -- vigente al momento de la venta — mismo criterio que
  -- venta_items.precio_compra_unitario: si el % de IVA del negocio cambia
  -- después, las facturas ya emitidas no deben recalcularse con la tasa
  -- nueva. Nullable porque las ventas ya existentes antes de esta historia
  -- nunca capturaron este dato; ventasService lo aproxima con la tasa
  -- ACTUAL de configuracion_empresa para esos casos y lo marca como
  -- aproximado (mismo patrón que gananciaAproximada en reportesRepo.js).
  -- Decisión de diseño confirmada: el precio de cada producto YA incluye el
  -- IVA (precio_detal/precio_mayor no cambian), así que este campo es
  -- puramente informativo para desglosar la factura — nunca altera
  -- subtotal/descuento/total, que se calculan exactamente igual que antes.
  iva_porcentaje INTEGER CHECK (iva_porcentaje BETWEEN 0 AND 100),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

-- nombre_producto y precio_unitario quedan como "foto" del momento de la
-- venta: si el producto cambia de nombre o precio después, la factura ya
-- emitida no se altera.
--
-- precio_compra_unitario es esa misma idea de "foto" aplicada al COSTO, no
-- solo al precio de venta: se agregó con HU-14 al notar que la ganancia se
-- calculaba contra productos.precio_compra ACTUAL, no el que tenía el
-- producto el día de la venta. Si el costo de un producto cambia después
-- (algo que PUT /productos/:id ya permite libremente), sin esta columna
-- cualquier reporte de ganancia sobre ventas pasadas quedaría mal — el mismo
-- problema que nombre_producto/precio_unitario ya resuelven para el precio
-- de venta. Nullable porque las ventas ya registradas antes de este cambio
-- nunca capturaron ese dato y no hay forma de reconstruirlo con certeza
-- (ver migración en db.js); reportesRepo.js aproxima esos casos viejos con
-- el precio_compra actual del producto y lo marca como aproximado.
CREATE TABLE IF NOT EXISTS venta_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id INTEGER NOT NULL REFERENCES ventas(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  nombre_producto TEXT NOT NULL,
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario INTEGER NOT NULL CHECK (precio_unitario >= 0),
  precio_compra_unitario INTEGER CHECK (precio_compra_unitario >= 0),
  subtotal INTEGER NOT NULL CHECK (subtotal >= 0)
);

-- Épica 4 (HU-11, HU-12, HU-13): Clientes, ventas a crédito y deudas
--
-- Modelo de deudas: una venta a crédito ES la deuda; no existe una tabla
-- "deudas" aparte. Motivo: HU-12 dice "una venta a crédito genera una
-- deuda" — la relación es 1 a 1 por definición (no hay deudas que no vengan
-- de una venta a crédito), así que una tabla "deudas" solo terminaría
-- duplicando venta_id sin agregar información real, y complicaría la
-- transacción de HU-12 punto 5 (habría que insertar en dos tablas en vez de
-- una). El saldo pendiente de una venta a crédito se calcula siempre como
-- `ventas.total - SUM(abonos.monto)` en el momento de la consulta — nunca
-- se guarda un saldo "cacheado" en una columna. Así es imposible que el
-- saldo mostrado se desincronice de la suma real de abonos (el bug clásico
-- de mantener un total denormalizado al día); con el volumen de ventas de
-- una tienda local esa suma en cada consulta es un costo trivial.
CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,

  -- Único cuando existe, pero opcional: mismo criterio ya usado en
  -- productos.codigo_barras (UNIQUE en SQLite permite múltiples NULL, así
  -- que varios clientes sin documento registrado conviven sin chocar).
  documento TEXT UNIQUE,

  telefono TEXT,
  correo TEXT,

  -- Distingue clientes mayoristas (HU-11) de clientes ocasionales.
  es_mayorista INTEGER NOT NULL DEFAULT 0 CHECK (es_mayorista IN (0, 1)),

  -- "Eliminar" desactiva, no borra: mismo criterio que productos.activo —
  -- un cliente desactivado puede tener ventas/deudas históricas que no
  -- deben perderse.
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),

  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Un abono es un pago parcial contra UNA venta a crédito puntual, no contra
-- un "saldo general" del cliente: el sistema no reparte automáticamente un
-- pago entre varias ventas pendientes, la usuaria elige a cuál venta aplica
-- cada abono. Es más simple (sin lógica de reparto/orden de pago) y da
-- trazabilidad exacta ("este pago fue por esta compra"), coherente con que
-- cada venta a crédito ya es su propia deuda.
CREATE TABLE IF NOT EXISTS abonos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id INTEGER NOT NULL REFERENCES ventas(id),
  -- Que la venta referenciada tenga metodo_pago = 'credito' es una regla
  -- entre tablas (no expresable como CHECK de SQLite); se valida en
  -- creditoService antes de insertar.
  monto INTEGER NOT NULL CHECK (monto > 0),
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

-- HU-18: Configuración de la empresa (para el encabezado de la factura y del correo)
--
-- Tabla de una sola fila, no clave-valor genérico: los campos que pide
-- HU-18 son fijos y conocidos de antemano (nombre, NIT, dirección, teléfono,
-- correo, logo), no un conjunto abierto que la usuaria vaya a definir en
-- tiempo de ejecución. Un modelo clave-valor (clave TEXT, valor TEXT)
-- sacrificaría tipos y CHECK por columna, y cada lectura tendría que pivotar
-- N filas a un objeto en el código — sin ganar nada a cambio, porque acá se
-- sabe de antemano cuáles son las columnas. El IVA de "requisitos
-- adicionales" es una historia distinta con su propio tipo (un porcentaje
-- numérico) y sus propias reglas: cuando llegue, le corresponde su propia
-- tabla (mismo criterio que ya se usó para separar productos/ventas/
-- clientes/abonos en vez de mezclarlos), no forzarlo en esta.
--
-- `id INTEGER PRIMARY KEY CHECK (id = 1)` garantiza que solo puede existir
-- una fila (cualquier INSERT con otro id viola el CHECK; insertar id=1 de
-- nuevo viola la PRIMARY KEY). El INSERT OR IGNORE de abajo siembra la fila
-- por defecto la primera vez; en arranques siguientes no hace nada porque
-- la fila con id=1 ya existe (haya sido tocada por la usuaria o no) — así
-- la app nunca arranca con la tabla vacía.
--
-- logo_ruta guarda solo la RUTA/URL del archivo, nunca la imagen en base64
-- dentro de la BD. Motivo: la BD se respalda completa una vez al día
-- (backupService) y se conservan hasta 30 respaldos — un logo embebido se
-- multiplicaría por cada backup diario (30 copias del mismo logo pesando lo
-- mismo que la imagen), en un equipo de gama baja donde tanto el disco como
-- la sincronización con Google Drive Desktop son recursos limitados. Con
-- una ruta, cada backup diario solo carga con una cadena de texto de unos
-- pocos bytes; el archivo de imagen en sí es responsabilidad de su propia
-- carpeta (ver src/public/uploads/ y el comentario en configuracionService.js).
CREATE TABLE IF NOT EXISTS configuracion_empresa (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  nombre_empresa TEXT NOT NULL DEFAULT 'Milagros',
  -- Texto, no número: un NIT colombiano lleva guiones y dígito de
  -- verificación (ej. "900123456-7"), no es una cantidad para operar.
  nit TEXT,
  direccion TEXT,
  telefono TEXT,
  correo TEXT,
  logo_ruta TEXT,
  -- Requisito adicional (IVA en la factura). Un solo % general para todo el
  -- negocio (no por producto): coincide con que "Configuración de IVA en la
  -- factura" está listado como una configuración general del negocio, y con
  -- el patrón de fila única que ya usa esta tabla. Entero (no REAL) por la
  -- misma razón que el resto de la app evita punto flotante; las tarifas de
  -- IVA colombianas son porcentajes enteros (19%, 5%, 0%). Default 19 (tarifa
  -- general vigente en Colombia) solo como punto de partida razonable — debe
  -- confirmarse con la usuaria antes de entregar (ver checklist de
  -- despliegue). Los precios de producto YA incluyen este IVA: no se suma
  -- aparte al vender, ver comentario en ventas.iva_porcentaje.
  iva_porcentaje INTEGER NOT NULL DEFAULT 19 CHECK (iva_porcentaje BETWEEN 0 AND 100),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO configuracion_empresa (id, nombre_empresa) VALUES (1, 'Milagros');

-- Requisito adicional: registro de auditoría (trazabilidad de acciones
-- sensibles: quién hizo qué, sobre qué, y cuándo).
--
-- Qué se guarda por evento, y por qué:
-- - usuario_id (FK nullable) + usuario (TEXT, copia del nombre): mismo
--   criterio "foto" que ya usan venta_items.nombre_producto y
--   ventas.cliente_id — si el usuario se llegara a borrar en el futuro (hoy
--   no hay ni endpoint para eso), el registro de auditoría no debe volverse
--   ilegible ni perder el rastro de quién hizo la acción. usuario es NOT
--   NULL porque siempre hay al menos un nombre intentando la acción, incluso
--   en un login fallido con usuario inexistente (ahí usuario_id sí queda
--   NULL, porque no hay fila real en `usuarios` a la cual apuntar).
-- - accion (TEXT): un código corto y fijo (ej. 'venta_creada',
--   'login_fallido') definido como constantes en auditoriaService.js, no
--   texto libre — así los filtros por tipo de acción son exactos y no
--   dependen de que el texto se haya escrito siempre igual.
-- - entidad + entidad_id: sobre qué registro concreto actuó (ej. entidad
--   'producto', entidad_id 7), para poder cruzar el evento con la tabla real
--   si hace falta. Ambos nullable: un login no tiene una "entidad de
--   negocio" asociada más que el propio usuario.
-- - detalle (TEXT): un RESUMEN legible en una línea, no el objeto completo
--   antes/después. Para creaciones basta describir lo creado; para
--   ediciones, auditoriaService.resumirCambios() arma algo como
--   "precio_detal: 12000 -> 13000" listando solo los campos que
--   efectivamente cambiaron. Guardar el JSON completo del registro en cada
--   evento infla la tabla sin agregar valor real de auditoría: lo que
--   importa para "qué pasó" es qué cambió, no repetir campos que ya estaban
--   en la fila original y no se tocaron.
-- - ip (TEXT, nullable): se captura sobre todo para login (exitoso y
--   fallido), que es el evento donde más importa poder distinguir un
--   intento legítimo de uno indebido. Para el resto de acciones queda NULL
--   si el llamador no la pasa: no vale la pena forzarla en todos lados
--   cuando lo crítico para detectar acceso indebido es el login.
-- - creado_en: mismo patrón datetime('now') que el resto de tablas (UTC);
--   las consultas de auditoría filtran por fecha con el mismo ajuste de
--   -5 horas que reportesRepo.js usa para clasificar "a qué día calendario
--   colombiano" pertenece cada evento (ver auditoriaRepo.js).
--
-- Nunca se guardan contraseñas ni tokens de sesión en esta tabla, ni
-- siquiera hasheados: el campo `detalle` de un login nunca debe construirse
-- a partir de datos.password.
CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER REFERENCES usuarios(id),
  usuario TEXT NOT NULL,
  accion TEXT NOT NULL,
  entidad TEXT,
  entidad_id INTEGER,
  detalle TEXT,
  ip TEXT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_auditoria_creado_en ON auditoria(creado_en);
CREATE INDEX IF NOT EXISTS idx_auditoria_accion ON auditoria(accion);

-- Requisito adicional: purga automática de auditoría vieja (retención de
-- AUDITORIA_RETENCION_DIAS, ver auditoriaService.js), CON archivado previo.
--
-- El log de auditoría existe para poder investigar algo sospechoso después;
-- borrar sin más los registros vencidos destruiría justo la evidencia que
-- más podría hacer falta (ej. un fraude que se nota 45 días después de
-- ocurrido). Por eso la purga NO es un DELETE directo: primero copia cada
-- fila vencida (mismo id, para poder correlacionarla) a esta tabla espejo,
-- recién después la borra de `auditoria` (ver auditoriaRepo.purgarAntiguos).
--
-- Por qué una tabla espejo en el MISMO archivo .db, y no un archivo aparte
-- (JSON/CSV) en logs/: esta tabla queda cubierta automáticamente por el
-- backup diario ya existente (backupService.js hace db.backup() del archivo
-- .db COMPLETO hacia Google Drive Desktop) — sin agregar infraestructura
-- nueva ni tocar esa lógica de backup. Un archivo aparte en logs/ NO se
-- respalda hoy, así que sería menos seguro que la propia tabla activa.
--
-- Sin su propia purga: es el destino final. El volumen de auditoría de una
-- tienda local es bajo, así que conservarla indefinidamente no es un
-- problema real de espacio — el problema que se resuelve purgando es que
-- `auditoria` (la tabla ACTIVA que se consulta día a día) se mantenga
-- liviana, no que la evidencia desaparezca.
CREATE TABLE IF NOT EXISTS auditoria_archivo (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id),
  usuario TEXT NOT NULL,
  accion TEXT NOT NULL,
  entidad TEXT,
  entidad_id INTEGER,
  detalle TEXT,
  ip TEXT,
  creado_en TEXT NOT NULL,
  purgado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
