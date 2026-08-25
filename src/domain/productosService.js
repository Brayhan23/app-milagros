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
  // Number.isSafeInteger además de Number.isInteger: un valor como 1e21 pasa
  // Number.isInteger (no tiene parte decimal) pero excede el rango de entero
  // seguro de JS/SQLite — sin este chequeo, better-sqlite3 lanza un
  // RangeError al hacer bind, y esa excepción no atrapada tumba el proceso.
  if (!Number.isInteger(valor) || !Number.isSafeInteger(valor) || valor < 0) {
    return `El precio ${etiqueta} debe ser un número entero de pesos, mayor o igual a cero.`;
  }
  return null;
}

function validarEnteroNoNegativo(valor, etiqueta) {
  if (!Number.isInteger(valor) || !Number.isSafeInteger(valor) || valor < 0) {
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

// Advertencias, no bloqueos: pueden existir razones legítimas de negocio
// para romper el orden "normal" de precios (liquidación, producto por
// vencer, un producto sin diferencia real entre detal y mayor). Bloquear
// dejaría a la cajera sin poder guardar un precio que sí quiso poner a
// propósito; avisar le muestra el problema en lenguaje de negocio y la deja
// decidir. Mismo criterio para las dos comparaciones nuevas de coherencia
// (mayor vs. compra, detal vs. mayor) que para la ya existente de venta con
// pérdida: no son errores de sistema, son señales para que la usuaria
// revise si fue un error de digitación o si lo hizo a propósito.
function generarAdvertencias({ precioCompra, precioDetal, precioMayor }) {
  const advertencias = [];
  if (precioDetal < precioCompra) {
    advertencias.push('El precio al detal es menor al precio de compra: este producto se vendería con pérdida al detal.');
  }
  if (precioMayor < precioCompra) {
    advertencias.push('El precio al por mayor es menor al precio de compra: este producto se vendería con pérdida al por mayor.');
  } else if (precioMayor === precioCompra) {
    advertencias.push('El precio al por mayor es igual al precio de compra: este producto no dejaría ninguna ganancia al venderse por mayor.');
  }
  if (precioDetal < precioMayor) {
    advertencias.push('El precio al detal es menor al precio al por mayor: revisa si no se cambiaron los precios por error, porque normalmente quien compra al detal paga más por unidad que quien compra por mayor.');
  } else if (precioDetal === precioMayor) {
    advertencias.push('El precio al detal es igual al precio al por mayor: revisa si es intencional (por ejemplo, si este producto no maneja precio diferenciado por mayor).');
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

// Reactivar un producto previamente desactivado. Nunca puede chocar con la
// restricción UNIQUE de codigo_barras: buscarPorCodigoBarras() (usada por
// crearProducto/actualizarProducto para bloquear duplicados) no filtra por
// `activo`, así que mientras este producto siguió existiendo con `activo=0`
// su código de barras nunca quedó "libre" para que otro producto lo tomara
// — ningún otro producto pudo haberse creado ni editado con ese mismo
// código mientras tanto. Reactivar solo cambia la bandera `activo`, no
// toca `codigo_barras`, así que no hace falta repetir esa validación acá.
function reactivarProducto(id, usuario = null) {
  const actual = productosRepo.buscarPorId(id);
  if (!actual) {
    return { exito: false, error: 'no_encontrado', mensaje: 'No se encontró el producto.' };
  }

  const producto = productosRepo.reactivar(id);

  auditoriaService.registrar({
    usuario,
    accion: ACCIONES.PRODUCTO_REACTIVADO,
    entidad: 'producto',
    entidadId: id,
    detalle: `Producto "${actual.nombre}" (id ${id}) reactivado.`,
  });

  return { exito: true, producto };
}

// Borrado permanente: a diferencia de desactivarProducto, esto sí borra la
// fila. Solo es seguro cuando el producto nunca se usó — si venta_items lo
// referencia, borrarlo dejaría huérfanas esas filas y rompería el historial
// de esa factura, el reporte de productos más vendidos y el cálculo de
// ganancia histórica (todos hacen JOIN productos <- venta_items). El stock
// en cero evita borrar de la base de datos mercancía que sigue existiendo
// físicamente en la tienda sin dejar ningún rastro de qué producto era.
function eliminarProducto(id, usuario = null) {
  const actual = productosRepo.buscarPorId(id);
  if (!actual) {
    return { exito: false, error: 'no_encontrado', mensaje: 'No se encontró el producto.' };
  }

  const ventasAsociadas = productosRepo.contarVentaItems(id);
  const razones = [];
  if (ventasAsociadas > 0) {
    razones.push(`ya se vendió ${ventasAsociadas} ${ventasAsociadas === 1 ? 'vez' : 'veces'}`);
  }
  if (actual.stock_actual > 0) {
    razones.push(`todavía tiene ${actual.stock_actual} ${actual.stock_actual === 1 ? 'unidad' : 'unidades'} en stock`);
  }

  if (razones.length > 0) {
    return {
      exito: false,
      error: 'no_se_puede_eliminar',
      mensaje: `No se puede eliminar "${actual.nombre}" porque ${razones.join(' y ')}. Si ya no lo vas a vender, desactívalo en su lugar: deja de aparecer en las ventas nuevas, pero conserva su historial.`,
    };
  }

  productosRepo.eliminar(id);

  auditoriaService.registrar({
    usuario,
    accion: ACCIONES.PRODUCTO_ELIMINADO,
    entidad: 'producto',
    entidadId: id,
    detalle: `Producto "${actual.nombre}" (id ${id}) eliminado de forma permanente.`,
  });

  return { exito: true };
}

// --- Nuevas funciones de Dominio para HU-03, HU-04 y HU-05 ---

// HU-03: Actualizar stock por ingreso de productos
function ingresarStock(id, cantidad, usuario = null) {
  const producto = productosRepo.buscarPorId(id);
  if (!producto) {
    return { exito: false, error: 'no_encontrado', mensaje: 'No se encontró el producto.' };
  }

  const cantidadEntera = aEntero(cantidad);
  if (!Number.isInteger(cantidadEntera) || !Number.isSafeInteger(cantidadEntera) || cantidadEntera <= 0) {
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
  reactivarProducto,
  eliminarProducto,
  // Nuevas exportaciones:
  ingresarStock,
  obtenerAlertasStock,
  consultarStockTiempoReal,
};

