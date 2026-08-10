-- Esquema de base de datos: App Milagros
-- HU-01: Autenticación

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
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
