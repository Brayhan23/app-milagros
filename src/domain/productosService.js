const productosRepo = require('../data/productosRepo');
const auditoriaService = require('./auditoriaService');
const { ACCIONES } = auditoriaService;

function normalizarTexto(valor) {
  if (typeof valor !== 'string') return valor;
  const limpio = valor.trim();
  return limpio === '' ? null : limpio;
}

// Acepta número o texto numérico (formularios suelen mandar strings) y
// devuelve un entero, o NaN si no se puede interpretar como tal.
function aEntero(valor) {
  if (typeof valor === 'number') return valor;
  if (typeof valor === 'string' && valor.trim() !== '' && !Number.isNaN(Number(valor))) {
    return Number(valor);
  }
  return NaN;
}

function validarPrecio(valor, etiqueta) {
  if (!Number.isInteger(valor) || valor < 0) {
    return `El precio ${etiqueta} debe ser un número entero de pesos, mayor o igual a cero.`;
  }
  return null;
}

function validarEnteroNoNegativo(valor, etiqueta) {
  if (!Number.isInteger(valor) || valor < 0) {
    return `${etiqueta} debe ser un número entero mayor o igual a cero.`;
  }
  return null;
}

function validarCamposProducto({ nombre, precioCompra, precioDetal, precioMayor, stockMinimo, stockActual }) {
  if (!nombre) {
    return { exito: false, error: 'nombre_requerido', mensaje: 'El nombre del producto es obligatorio.' };
  }

  const errorPrecioCompra = validarPrecio(precioCompra, 'de compra');
  if (errorPrecioCompra) return { exito: false, error: 'precio_invalido', mensaje: errorPrecioCompra };

  const errorPrecioDetal = validarPrecio(precioDetal, 'al detal');
  if (errorPrecioDetal) return { exito: false, error: 'precio_invalido', mensaje: errorPrecioDetal };

  const errorPrecioMayor = validarPrecio(precioMayor, 'al por mayor');
  if (errorPrecioMayor) return { exito: false, error: 'precio_invalido', mensaje: errorPrecioMayor };

  const errorStockMinimo = validarEnteroNoNegativo(stockMinimo, 'El stock mínimo');
  if (errorStockMinimo) return { exito: false, error: 'stock_invalido', mensaje: errorStockMinimo };

  const errorStockActual = validarEnteroNoNegativo(stockActual, 'El stock actual');
  if (errorStockActual) return { exito: false, error: 'stock_invalido', mensaje: errorStockActual };

  return { exito: true };
}

function generarAdvertencias({ precioCompra, precioDetal, precioMayor }) {
  const advertencias = [];
  if (precioDetal < precioCompra) {
    advertencias.push('El precio al detal es menor al precio de compra: este producto se vendería con pérdida al detal.');
  }
  if (precioMayor < precioCompra) {
    advertencias.push('El precio al por mayor es menor al precio de compra: este producto se vendería con pérdida al por mayor.');
  }
  return advertencias;
}

function crearProducto(datos = {}, usuario = null) {
  const nombre = normalizarTexto(datos.nombre);
  const descripcion = normalizarTexto(datos.descripcion);
  const codigoBarras = normalizarTexto(datos.codigoBarras);
  const precioCompra = aEntero(datos.precioCompra);
  const precioDetal = aEntero(datos.precioDetal);
  const precioMayor = aEntero(datos.precioMayor);
  const stockActual = datos.stockActual !== undefined ? aEntero(datos.stockActual) : 0;
  const stockMinimo = datos.stockMinimo !== undefined ? aEntero(datos.stockMinimo) : 0;

  const validacion = validarCamposProducto({
    nombre,
    precioCompra,
    precioDetal,
    precioMayor,
    stockMinimo,
    stockActual,
  });
  if (!validacion.exito) return validacion;

  if (codigoBarras) {
    const existente = productosRepo.buscarPorCodigoBarras(codigoBarras);
    if (existente) {
      return {
        exito: false,
        error: 'codigo_duplicado',
        mensaje: `Ya existe un producto con el código de barras "${codigoBarras}".`,
      };
    }
  }

  const producto = productosRepo.crear({
    codigoBarras,
    nombre,
    descripcion,
    precioCompra,
    precioDetal,
    precioMayor,
    stockActual,
    stockMinimo,
  });

  auditoriaService.registrar({
    usuario,
    accion: ACCIONES.PRODUCTO_CREADO,
    entidad: 'producto',
    entidadId: producto.id,
    detalle: `Producto "${producto.nombre}" creado (precio detal $${precioDetal.toLocaleString('es-CO')}, precio mayor $${precioMayor.toLocaleString('es-CO')}, stock inicial ${stockActual}).`,
  });

  return { exito: true, producto, advertencias: generarAdvertencias({ precioCompra, precioDetal, precioMayor }) };
}

function listarProductos({ incluirInactivos = false } = {}) {
  return { exito: true, productos: productosRepo.listar({ incluirInactivos }) };
}

function buscarPorCodigoBarras(codigoBarras) {
  const producto = productosRepo.buscarPorCodigoBarras(codigoBarras);
  if (!producto) {
    return { exito: false, error: 'no_encontrado', mensaje: 'No se encontró un producto con ese código de barras.' };
  }
  return { exito: true, producto };
}

function actualizarProducto(id, datos = {}, usuario = null) {
  const actual = productosRepo.buscarPorId(id);
  if (!actual) {
    return { exito: false, error: 'no_encontrado', mensaje: 'No se encontró el producto.' };
  }

  const nombre = datos.nombre !== undefined ? normalizarTexto(datos.nombre) : actual.nombre;
  const descripcion = datos.descripcion !== undefined ? normalizarTexto(datos.descripcion) : actual.descripcion;
  const codigoBarras = datos.codigoBarras !== undefined ? normalizarTexto(datos.codigoBarras) : actual.codigo_barras;
  const precioCompra = datos.precioCompra !== undefined ? aEntero(datos.precioCompra) : actual.precio_compra;
  const precioDetal = datos.precioDetal !== undefined ? aEntero(datos.precioDetal) : actual.precio_detal;
  const precioMayor = datos.precioMayor !== undefined ? aEntero(datos.precioMayor) : actual.precio_mayor;
  const stockMinimo = datos.stockMinimo !== undefined ? aEntero(datos.stockMinimo) : actual.stock_minimo;

  const validacion = validarCamposProducto({
    nombre,
    precioCompra,
    precioDetal,
    precioMayor,
    stockMinimo,
    stockActual: actual.stock_actual, // no se toca aquí: HU-03 maneja movimientos de stock
  });
  if (!validacion.exito) return validacion;

  if (codigoBarras) {
    const existente = productosRepo.buscarPorCodigoBarras(codigoBarras);
    if (existente && existente.id !== id) {
      return {
        exito: false,
        error: 'codigo_duplicado',
        mensaje: `Ya existe un producto con el código de barras "${codigoBarras}".`,
      };
    }
  }

  const producto = productosRepo.actualizar(id, {
    codigoBarras,
    nombre,
    descripcion,
    precioCompra,
    precioDetal,
    precioMayor,
    stockMinimo,
  });

  const resumen = auditoriaService.resumirCambios(
    {
      nombre: actual.nombre,
      descripcion: actual.descripcion,
      codigo_barras: actual.codigo_barras,
      precio_compra: actual.precio_compra,
      precio_detal: actual.precio_detal,
      precio_mayor: actual.precio_mayor,
      stock_minimo: actual.stock_minimo,
    },
    {
      nombre,
      descripcion,
      codigo_barras: codigoBarras,
      precio_compra: precioCompra,
      precio_detal: precioDetal,
      precio_mayor: precioMayor,
      stock_minimo: stockMinimo,
    },
    ['nombre', 'descripcion', 'codigo_barras', 'precio_compra', 'precio_detal', 'precio_mayor', 'stock_minimo']
  );
  auditoriaService.registrar({
    usuario,
    accion: ACCIONES.PRODUCTO_ACTUALIZADO,
    entidad: 'producto',
    entidadId: id,
    detalle: `Producto "${producto.nombre}" (id ${id}) actualizado: ${resumen}.`,
  });

  return { exito: true, producto, advertencias: generarAdvertencias({ precioCompra, precioDetal, precioMayor }) };
}

function desactivarProducto(id, usuario = null) {
  const actual = productosRepo.buscarPorId(id);
  if (!actual) {
    return { exito: false, error: 'no_encontrado', mensaje: 'No se encontró el producto.' };
  }

  const producto = productosRepo.desactivar(id);

  auditoriaService.registrar({
    usuario,
    accion: ACCIONES.PRODUCTO_DESACTIVADO,
    entidad: 'producto',
    entidadId: id,
    detalle: `Producto "${actual.nombre}" (id ${id}) desactivado.`,
  });

  return { exito: true, producto };
}

// --- Nuevas funciones de Dominio para HU-03, HU-04 y HU-05 ---

// HU-03: Actualizar stock por ingreso de productos
function ingresarStock(id, cantidad, usuario = null) {
  const producto = productosRepo.buscarPorId(id);
  if (!producto) {
    return { exito: false, error: 'no_encontrado', mensaje: 'No se encontró el producto.' };
  }

  const cantidadEntera = aEntero(cantidad);
  if (!Number.isInteger(cantidadEntera) || cantidadEntera <= 0) {
    return {
      exito: false,
      error: 'cantidad_invalida',
      mensaje: 'La cantidad a ingresar debe ser un número entero mayor a cero.',
    };
  }

  const productoActualizado = productosRepo.actualizarStock(id, cantidadEntera);

  auditoriaService.registrar({
    usuario,
    accion: ACCIONES.STOCK_INGRESADO,
    entidad: 'producto',
    entidadId: id,
    detalle: `Ingreso de stock: +${cantidadEntera} unidades de "${producto.nombre}" (stock resultante: ${productoActualizado.stock_actual}).`,
  });

  return {
    exito: true,
    producto: productoActualizado,
    bajoStock: productoActualizado.stock_actual <= productoActualizado.stock_minimo,
  };
}

// HU-04: Consultar productos con alerta de stock bajo
function obtenerAlertasStock() {
  const productos = productosRepo.listarBajoStock();
  return {
    exito: true,
    totalAlertas: productos.length,
    productos,
  };
}

// HU-05: Consultar stock disponible en tiempo real
function consultarStockTiempoReal() {
  const stock = productosRepo.obtenerStockEnTiempoReal();
  return {
    exito: true,
    inventario: stock,
  };
}

module.exports = {
  crearProducto,
  listarProductos,
  buscarPorCodigoBarras,
  actualizarProducto,
  desactivarProducto,
  // Nuevas exportaciones:
  ingresarStock,
  obtenerAlertasStock,
  consultarStockTiempoReal,
};

