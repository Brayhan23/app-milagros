const express = require('express');
const ventasService = require('../domain/ventasService');

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

module.exports = router;
