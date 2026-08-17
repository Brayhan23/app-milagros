const ventasRepo = require('../data/ventasRepo');
const productosRepo = require('../data/productosRepo');
const clientesRepo = require('../data/clientesRepo');

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
    if (!Number.isInteger(productoId)) {
      return { exito: false, error: 'producto_no_encontrado', mensaje: 'Todos los items deben indicar un producto válido.' };
    }
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      return { exito: false, error: 'cantidad_invalida', mensaje: 'La cantidad de cada producto debe ser un número entero mayor a cero.' };
    }
  }

  return { exito: true };
}

function crearVenta(datos = {}) {
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
    if (!Number.isInteger(clienteId)) {
      return { exito: false, error: 'cliente_no_encontrado', mensaje: 'El id del cliente no es válido.' };
    }
    const cliente = clientesRepo.buscarPorId(clienteId);
    if (!cliente || !cliente.activo) {
      return { exito: false, error: 'cliente_no_encontrado', mensaje: 'No se encontró el cliente indicado.' };
    }
  }

  const validacionItems = validarItems(items);
  if (!validacionItems.exito) return validacionItems;

  if (!Number.isInteger(descuento) || descuento < 0) {
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

  const venta = ventasRepo.crear({
    tipoCliente,
    metodoPago,
    clienteId,
    descuento,
    subtotal,
    total,
    items: itemsProcesados,
  });

  return { exito: true, venta };
}

function obtenerVenta(id) {
  const venta = ventasRepo.buscarPorId(id);
  if (!venta) {
    return { exito: false, error: 'no_encontrado', mensaje: 'No se encontró la venta.' };
  }
  return { exito: true, venta };
}

function listarVentas() {
  return { exito: true, ventas: ventasRepo.listar() };
}

module.exports = { crearVenta, obtenerVenta, listarVentas };
