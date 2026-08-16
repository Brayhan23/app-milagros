const express = require('express');
const clientesService = require('../domain/clientesService');
const creditoService = require('../domain/creditoService');

const router = express.Router();

const ESTADO_POR_ERROR = {
  nombre_requerido: 400,
  correo_invalido: 400,
  documento_duplicado: 409,
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

router.post('/clientes', (req, res) => {
  const resultado = clientesService.crearCliente(req.body || {});
  if (!resultado.exito) return responderError(res, resultado);
  return res.status(201).json({ exito: true, cliente: resultado.cliente });
});

router.get('/clientes', (req, res) => {
  const incluirInactivos = req.query.incluirInactivos === 'true';
  const resultado = clientesService.listarClientes({ incluirInactivos });
  return res.json(resultado);
});

// HU-13. Tiene que ir ANTES de "/clientes/:id": si no, Express interpretaría
// "deudas" como si fuera un id de cliente y esta ruta nunca se alcanzaría.
router.get('/clientes/deudas', (req, res) => {
  const resultado = creditoService.listarClientesConDeuda();
  return res.json(resultado);
});

router.get('/clientes/:id', (req, res) => {
  const id = parsearId(req.params.id);
  if (id === null) {
    return res.status(400).json({ exito: false, mensaje: 'El id del cliente debe ser un número entero.' });
  }

  const resultado = clientesService.buscarClientePorId(id);
  if (!resultado.exito) return responderError(res, resultado);
  return res.json(resultado);
});

// Detalle de deuda de un cliente: ventas a crédito que la componen y abonos.
router.get('/clientes/:id/deuda', (req, res) => {
  const id = parsearId(req.params.id);
  if (id === null) {
    return res.status(400).json({ exito: false, mensaje: 'El id del cliente debe ser un número entero.' });
  }

  const resultado = creditoService.obtenerDeudaCliente(id);
  if (!resultado.exito) return responderError(res, resultado);
  return res.json(resultado);
});

router.put('/clientes/:id', (req, res) => {
  const id = parsearId(req.params.id);
  if (id === null) {
    return res.status(400).json({ exito: false, mensaje: 'El id del cliente debe ser un número entero.' });
  }

  const resultado = clientesService.actualizarCliente(id, req.body || {});
  if (!resultado.exito) return responderError(res, resultado);
  return res.json({ exito: true, cliente: resultado.cliente });
});

router.delete('/clientes/:id', (req, res) => {
  const id = parsearId(req.params.id);
  if (id === null) {
    return res.status(400).json({ exito: false, mensaje: 'El id del cliente debe ser un número entero.' });
  }

  const resultado = clientesService.desactivarCliente(id);
  if (!resultado.exito) return responderError(res, resultado);
  return res.json({ exito: true, cliente: resultado.cliente });
});

module.exports = router;
