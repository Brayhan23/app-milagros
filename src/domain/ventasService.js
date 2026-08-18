const ventasRepo = require('../data/ventasRepo');
const productosRepo = require('../data/productosRepo');
const clientesRepo = require('../data/clientesRepo');
const configuracionRepo = require('../data/configuracionRepo');
const auditoriaService = require('./auditoriaService');
const { ACCIONES } = auditoriaService;

const TIPOS_CLIENTE = ['detal', 'mayor'];
const METODOS_PAGO = ['efectivo', 'transferencia', 'credito'];

function aEntero(valor) {
  if (typeof valor === 'number') return valor;
  if (typeof valor === 'string' && valor.trim() !== '' && !Number.isNaN(Number(valor))) {
    return Number(valor);
  }
  return NaN;
}

function validarItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { exito: false, error: 'items_vacios', mensaje: 'La venta debe tener al menos un producto.' };
  }

  for (const item of items) {
    const productoId = aEntero(item.productoId);
    const cantidad = aEntero(item.cantidad);
    // Number.isSafeInteger evita que un valor fuera del rango entero seguro
    // (ej. 1e21) pase la validación y rompa al hacer bind en better-sqlite3.
    if (!Number.isInteger(productoId) || !Number.isSafeInteger(productoId)) {
      return { exito: false, error: 'producto_no_encontrado', mensaje: 'Todos los items deben indicar un producto válido.' };
    }
    if (!Number.isInteger(cantidad) || !Number.isSafeInteger(cantidad) || cantidad <= 0) {
      return { exito: false, error: 'cantidad_invalida', mensaje: 'La cantidad de cada producto debe ser un número entero mayor a cero.' };
    }
  }

  return { exito: true };
}

// Decisión de diseño confirmada: los precios de producto YA incluyen IVA
// (no se suma aparte al vender), así que subtotal/descuento/total no
// cambian en absoluto por esta cuenta — es puramente un desglose informativo
// de cuánto de un monto que YA incluye impuesto corresponde a ese impuesto.
// Fórmula estándar para "desincluir" IVA de un total: base = total / (1 +
// tasa/100). ivaMonto se calcula como el RESIDUO (total - base), no con su
// propia fórmula redondeada aparte, para garantizar SIEMPRE que
// baseGravable + ivaMonto === total exactamente (sin esto, dos redondeos
// independientes podrían no sumar el total real, un bug clásico de reparto).
//
// Orden de operaciones con el descuento: el descuento ya se resta del
// subtotal ANTES de este cálculo (ver más abajo, total = subtotal -
// descuento, sin cambios). El desglose de IVA se calcula sobre ese TOTAL ya
// descontado, no sobre el subtotal bruto — en la práctica esto reparte el
// descuento proporcionalmente entre base gravable e IVA, que es como
// funciona un descuento de mostrador sobre un precio que ya incluye
// impuesto: reduce el precio final que paga el cliente, y el IVA mostrado
// es el que corresponde a ESE precio final, no al precio de lista.
function calcularDesgloseIva(total, ivaPorcentaje) {
  const baseGravable = Math.round(total / (1 + ivaPorcentaje / 100));
  const ivaMonto = total - baseGravable;
  return { baseGravable, ivaMonto };
}

// Envuelve una venta (ya sea recién creada o leída de la BD) con el
// desglose de IVA para mostrar en factura/correo. Si la venta es anterior a
// esta historia (iva_porcentaje NULL, ver migración en db.js), se aproxima
// con la tasa ACTUAL del negocio y se marca ivaAproximado — mismo patrón
// que gananciaAproximada en reportesRepo.js: nunca se inventa un dato
// histórico que no se guardó, pero tampoco se deja a la usuaria sin ver
// nada en una factura vieja.
function enriquecerConDesgloseIva(venta) {
  const ivaAproximado = venta.iva_porcentaje === null || venta.iva_porcentaje === undefined;
  const ivaPorcentaje = ivaAproximado ? configuracionRepo.obtener().iva_porcentaje : venta.iva_porcentaje;
  const { baseGravable, ivaMonto } = calcularDesgloseIva(venta.total, ivaPorcentaje);
  return { ...venta, ivaPorcentaje, baseGravable, ivaMonto, ivaAproximado };
}

function crearVenta(datos = {}, usuario = null) {
  const tipoCliente = datos.tipoCliente;
  const metodoPago = datos.metodoPago;
  const descuento = datos.descuento !== undefined ? aEntero(datos.descuento) : 0;
  const items = datos.items;
  const clienteId = datos.clienteId !== undefined && datos.clienteId !== null ? aEntero(datos.clienteId) : null;

  if (!TIPOS_CLIENTE.includes(tipoCliente)) {
    return { exito: false, error: 'tipo_cliente_invalido', mensaje: 'El tipo de cliente debe ser "detal" o "mayor".' };
  }

  if (!METODOS_PAGO.includes(metodoPago)) {
    return { exito: false, error: 'metodo_pago_invalido', mensaje: 'El método de pago debe ser efectivo, transferencia o crédito.' };
  }

  // HU-12, regla crítica: sin cliente no hay a quién cobrarle la deuda.
  if (metodoPago === 'credito' && clienteId === null) {
    return { exito: false, error: 'cliente_requerido', mensaje: 'Las ventas a crédito deben indicar un cliente.' };
  }

  if (clienteId !== null) {
    if (!Number.isInteger(clienteId) || !Number.isSafeInteger(clienteId)) {
      return { exito: false, error: 'cliente_no_encontrado', mensaje: 'El id del cliente no es válido.' };
    }
    const cliente = clientesRepo.buscarPorId(clienteId);
    if (!cliente || !cliente.activo) {
      return { exito: false, error: 'cliente_no_encontrado', mensaje: 'No se encontró el cliente indicado.' };
    }
  }

  const validacionItems = validarItems(items);
  if (!validacionItems.exito) return validacionItems;

  if (!Number.isInteger(descuento) || !Number.isSafeInteger(descuento) || descuento < 0) {
    return { exito: false, error: 'descuento_invalido', mensaje: 'El descuento debe ser un número entero de pesos, mayor o igual a cero.' };
  }

  const cantidadPorProducto = new Map();
  for (const item of items) {
    const productoId = aEntero(item.productoId);
    const cantidad = aEntero(item.cantidad);
    cantidadPorProducto.set(productoId, (cantidadPorProducto.get(productoId) || 0) + cantidad);
  }

  const productosPorId = new Map();
  for (const productoId of cantidadPorProducto.keys()) {
    const producto = productosRepo.buscarPorId(productoId);
    if (!producto || !producto.activo) {
      return { exito: false, error: 'producto_no_encontrado', mensaje: `No se encontró el producto con id ${productoId}.` };
    }
    const cantidadTotal = cantidadPorProducto.get(productoId);
    if (cantidadTotal > producto.stock_actual) {
      return {
        exito: false,
        error: 'stock_insuficiente',
        mensaje: `Stock insuficiente para "${producto.nombre}": disponible ${producto.stock_actual}, solicitado ${cantidadTotal}.`,
      };
    }
    productosPorId.set(productoId, producto);
  }

  const itemsProcesados = items.map((item) => {
    const productoId = aEntero(item.productoId);
    const cantidad = aEntero(item.cantidad);
    const producto = productosPorId.get(productoId);
    const precioUnitario = tipoCliente === 'mayor' ? producto.precio_mayor : producto.precio_detal;
    return {
      productoId,
      nombreProducto: producto.nombre,
      cantidad,
      precioUnitario,
      // HU-14: "foto" del costo al momento de la venta, mismo criterio que
      // nombre_producto/precioUnitario — así la ganancia reportada después
      // no cambia si el precio de compra del producto se edita más tarde.
      precioCompraUnitario: producto.precio_compra,
      subtotal: precioUnitario * cantidad,
    };
  });

  const subtotal = itemsProcesados.reduce((suma, item) => suma + item.subtotal, 0);

  if (descuento > subtotal) {
    return { exito: false, error: 'descuento_invalido', mensaje: 'El descuento no puede ser mayor al subtotal de la venta.' };
  }

  const total = subtotal - descuento;
  // Tasa vigente AL MOMENTO de la venta: se guarda como "foto" en la propia
  // venta (ver ventasRepo/schema.sql) para que un cambio futuro del % de IVA
  // general del negocio no altere facturas ya emitidas.
  const ivaPorcentaje = configuracionRepo.obtener().iva_porcentaje;

  const venta = ventasRepo.crear({
    tipoCliente,
    metodoPago,
    clienteId,
    descuento,
    subtotal,
    total,
    ivaPorcentaje,
    items: itemsProcesados,
  });

  auditoriaService.registrar({
    usuario,
    accion: ACCIONES.VENTA_CREADA,
    entidad: 'venta',
    entidadId: venta.id,
    detalle: `Venta #${venta.id} por $${total.toLocaleString('es-CO')} (${metodoPago}, ${tipoCliente}), ${itemsProcesados.length} producto(s).`,
  });

  return { exito: true, venta: enriquecerConDesgloseIva(venta) };
}

function obtenerVenta(id) {
  const venta = ventasRepo.buscarPorId(id);
  if (!venta) {
    return { exito: false, error: 'no_encontrado', mensaje: 'No se encontró la venta.' };
  }
  return { exito: true, venta: enriquecerConDesgloseIva(venta) };
}

function listarVentas() {
  return { exito: true, ventas: ventasRepo.listar().map(enriquecerConDesgloseIva) };
}

module.exports = { crearVenta, obtenerVenta, listarVentas, calcularDesgloseIva };
