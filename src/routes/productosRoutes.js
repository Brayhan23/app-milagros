const express = require('express');
const productosService = require('../domain/productosService');

const router = express.Router();
// Actualiza el objeto de errores para incluir el nuevo error
const ESTADO_POR_ERROR = {
  nombre_requerido: 400,
  precio_invalido: 400,
  stock_invalido: 400,
  cantidad_invalida: 400,
  codigo_duplicado: 409,
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

router.post('/productos', (req, res) => {
  const resultado = productosService.crearProducto(req.body || {});
  if (!resultado.exito) return responderError(res, resultado);
  return res.status(201).json({ exito: true, producto: resultado.producto, advertencias: resultado.advertencias });
});

router.get('/productos', (req, res) => {
  const incluirInactivos = req.query.incluirInactivos === 'true';
  const resultado = productosService.listarProductos({ incluirInactivos });
  return res.json(resultado);
});

router.get('/productos/:codigoBarras', (req, res) => {
  const resultado = productosService.buscarPorCodigoBarras(req.params.codigoBarras);
  if (!resultado.exito) return responderError(res, resultado);
  return res.json(resultado);
});

router.put('/productos/:id', (req, res) => {
  const id = parsearId(req.params.id);
  if (id === null) {
    return res.status(400).json({ exito: false, mensaje: 'El id del producto debe ser un número entero.' });
  }

  const resultado = productosService.actualizarProducto(id, req.body || {});
  if (!resultado.exito) return responderError(res, resultado);
  return res.json({ exito: true, producto: resultado.producto, advertencias: resultado.advertencias });
});

router.delete('/productos/:id', (req, res) => {
  const id = parsearId(req.params.id);
  if (id === null) {
    return res.status(400).json({ exito: false, mensaje: 'El id del producto debe ser un número entero.' });
  }

  const resultado = productosService.desactivarProducto(id);
  if (!resultado.exito) return responderError(res, resultado);
  return res.json({ exito: true, producto: resultado.producto });
});



// --- Nuevas Rutas ---

// HU-03: Reabastecer stock de un producto
router.patch('/productos/:id/stock', (req, res) => {
  const id = parsearId(req.params.id);
  if (id === null) {
    return res.status(400).json({ exito: false, mensaje: 'El id del producto debe ser un número entero.' });
  }

  const { cantidad } = req.body || {};
  const resultado = productosService.ingresarStock(id, cantidad);
  if (!resultado.exito) return responderError(res, resultado);

  return res.json(resultado);
});

// HU-04: Obtener alertas de productos por agotarse (stock_actual <= stock_minimo)
router.get('/productos/alertas/stock-bajo', (req, res) => {
  const resultado = productosService.obtenerAlertasStock();
  return res.json(resultado);
});

// HU-05: Consultar stock en tiempo real
router.get('/productos/stock/tiempo-real', (req, res) => {
  const resultado = productosService.consultarStockTiempoReal();
  return res.json(resultado);
});

module.exports = router;
