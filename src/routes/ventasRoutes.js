const express = require('express');
const ventasService = require('../domain/ventasService');
const emailService = require('../domain/emailService');
const creditoService = require('../domain/creditoService');

const router = express.Router();

const ESTADO_POR_ERROR = {
  tipo_cliente_invalido: 400,
  metodo_pago_invalido: 400,
  items_vacios: 400,
  cantidad_invalida: 400,
  descuento_invalido: 400,
  producto_no_encontrado: 404,
  stock_insuficiente: 409,
  no_encontrado: 404,
  correo_invalido: 400,
  smtp_no_configurado: 503,
  envio_fallido: 502,
  // HU-11/HU-12: crédito y clientes
  cliente_requerido: 400,
  cliente_no_encontrado: 404,
  venta_invalida: 400,
  monto_invalido: 400,
  venta_no_es_credito: 409,
  monto_supera_saldo: 409,
};

function responderError(res, resultado) {
  const status = ESTADO_POR_ERROR[resultado.error] || 400;
  return res.status(status).json({ exito: false, mensaje: resultado.mensaje });
}

function parsearId(valor) {
  const id = Number(valor);
  return Number.isInteger(id) ? id : null;
}

router.post('/ventas', (req, res) => {
  const resultado = ventasService.crearVenta(req.body || {});
  if (!resultado.exito) return responderError(res, resultado);
  return res.status(201).json({ exito: true, venta: resultado.venta });
});

router.get('/ventas', (req, res) => {
  const resultado = ventasService.listarVentas();
  return res.json(resultado);
});

router.get('/ventas/:id', (req, res) => {
  const id = parsearId(req.params.id);
  if (id === null) {
    return res.status(400).json({ exito: false, mensaje: 'El id de la venta debe ser un número entero.' });
  }

  const resultado = ventasService.obtenerVenta(id);
  if (!resultado.exito) return responderError(res, resultado);
  return res.json(resultado);
});

// HU-07: enviar copia de la factura ya generada por correo (sin timbrado DIAN).
router.post('/ventas/:id/enviar-correo', async (req, res) => {
  const id = parsearId(req.params.id);
  if (id === null) {
    return res.status(400).json({ exito: false, mensaje: 'El id de la venta debe ser un número entero.' });
  }

  const { correoDestino } = req.body || {};
  const resultado = await emailService.enviarFacturaPorCorreo(id, correoDestino);
  if (!resultado.exito) return responderError(res, resultado);

  return res.json({ exito: true, mensaje: 'Factura enviada por correo correctamente.' });
});

// HU-12: registrar un abono contra una venta a crédito puntual.
router.post('/ventas/:id/abonos', (req, res) => {
  const id = parsearId(req.params.id);
  if (id === null) {
    return res.status(400).json({ exito: false, mensaje: 'El id de la venta debe ser un número entero.' });
  }

  const { monto } = req.body || {};
  const resultado = creditoService.registrarAbono({ ventaId: id, monto });
  if (!resultado.exito) return responderError(res, resultado);

  return res.status(201).json(resultado);
});

module.exports = router;
