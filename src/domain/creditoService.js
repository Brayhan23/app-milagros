const clientesRepo = require('../data/clientesRepo');
const deudasRepo = require('../data/deudasRepo');

function aEntero(valor) {
  if (typeof valor === 'number') return valor;
  if (typeof valor === 'string' && valor.trim() !== '' && !Number.isNaN(Number(valor))) {
    return Number(valor);
  }
  return NaN;
}

function registrarAbono(datos = {}) {
  const ventaId = aEntero(datos.ventaId);
  const monto = aEntero(datos.monto);

  if (!Number.isInteger(ventaId)) {
    return { exito: false, error: 'venta_invalida', mensaje: 'Debes indicar una venta válida.' };
  }

  if (!Number.isInteger(monto) || monto <= 0) {
    return { exito: false, error: 'monto_invalido', mensaje: 'El monto del abono debe ser un número entero mayor a cero.' };
  }

  const venta = deudasRepo.saldoDeVenta(ventaId);
  if (!venta) {
    return { exito: false, error: 'no_encontrado', mensaje: 'No se encontró la venta.' };
  }

  if (venta.metodo_pago !== 'credito') {
    return {
      exito: false,
      error: 'venta_no_es_credito',
      mensaje: 'Solo se pueden registrar abonos sobre ventas a crédito.',
    };
  }

  if (monto > venta.saldo) {
    return {
      exito: false,
      error: 'monto_supera_saldo',
      mensaje: `El abono ($${monto.toLocaleString('es-CO')}) no puede superar el saldo pendiente ($${venta.saldo.toLocaleString('es-CO')}).`,
    };
  }

  const abono = deudasRepo.registrarAbono(ventaId, monto);
  const ventaActualizada = deudasRepo.saldoDeVenta(ventaId);

  return { exito: true, abono, saldoRestante: ventaActualizada.saldo };
}

function obtenerDeudaCliente(clienteId) {
  const cliente = clientesRepo.buscarPorId(clienteId);
  if (!cliente) {
    return { exito: false, error: 'no_encontrado', mensaje: 'No se encontró el cliente.' };
  }

  const ventas = deudasRepo.ventasCreditoDeCliente(clienteId);
  const abonos = deudasRepo.abonosDeCliente(clienteId);
  const saldoTotal = ventas.reduce((suma, venta) => suma + venta.saldo, 0);

  return { exito: true, cliente, ventas, abonos, saldoTotal };
}

function listarClientesConDeuda() {
  return { exito: true, clientes: deudasRepo.listarClientesConDeuda() };
}

module.exports = { registrarAbono, obtenerDeudaCliente, listarClientesConDeuda };
