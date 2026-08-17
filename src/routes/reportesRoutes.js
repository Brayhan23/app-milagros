const express = require('express');
const reportesService = require('../domain/reportesService');

const router = express.Router();

const ESTADO_POR_ERROR = {
  fecha_invalida: 400,
  rango_invalido: 400,
};

function responderError(res, resultado) {
  const status = ESTADO_POR_ERROR[resultado.error] || 400;
  return res.status(status).json({ exito: false, mensaje: resultado.mensaje });
}

// HU-14: ventas y ganancia del día (calendario colombiano).
router.get('/reportes/ventas-dia', (req, res) => {
  return res.json(reportesService.ventasDelDia());
});

// HU-15: mismo resumen que arriba, para un rango de fechas.
router.get('/reportes/historico', (req, res) => {
  const { desde, hasta } = req.query;
  if (!desde || !hasta) {
    return res.status(400).json({ exito: false, mensaje: 'Debes indicar los parámetros desde y hasta (AAAA-MM-DD).' });
  }

  const resultado = reportesService.historicoPorRango(desde, hasta);
  if (!resultado.exito) return responderError(res, resultado);
  return res.json(resultado);
});

// Listado de ventas individuales que componen el reporte del día / del
// rango, para navegar de "totales" a cada venta puntual (y desde ahí, a su
// factura completa vía GET /api/ventas/:id).
router.get('/reportes/ventas-dia/listado', (req, res) => {
  return res.json(reportesService.ventasDelDiaListado());
});

router.get('/reportes/historico/listado', (req, res) => {
  const { desde, hasta } = req.query;
  if (!desde || !hasta) {
    return res.status(400).json({ exito: false, mensaje: 'Debes indicar los parámetros desde y hasta (AAAA-MM-DD).' });
  }

  const resultado = reportesService.historicoListado(desde, hasta);
  if (!resultado.exito) return responderError(res, resultado);
  return res.json(resultado);
});

// HU-16: ranking de productos más vendidos, con rango de fechas opcional.
router.get('/reportes/productos-mas-vendidos', (req, res) => {
  const { desde, hasta } = req.query;
  const resultado = reportesService.productosMasVendidos({ desde, hasta });
  if (!resultado.exito) return responderError(res, resultado);
  return res.json(resultado);
});

module.exports = router;
