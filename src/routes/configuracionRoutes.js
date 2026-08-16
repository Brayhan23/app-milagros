const express = require('express');
const configuracionService = require('../domain/configuracionService');

const router = express.Router();

const ESTADO_POR_ERROR = {
  nombre_requerido: 400,
  correo_invalido: 400,
};

function responderError(res, resultado) {
  const status = ESTADO_POR_ERROR[resultado.error] || 400;
  return res.status(status).json({ exito: false, mensaje: resultado.mensaje });
}

router.get('/configuracion', (req, res) => {
  const resultado = configuracionService.obtenerConfiguracion();
  return res.json(resultado);
});

router.put('/configuracion', (req, res) => {
  const resultado = configuracionService.actualizarConfiguracion(req.body || {});
  if (!resultado.exito) return responderError(res, resultado);
  return res.json(resultado);
});

module.exports = router;
