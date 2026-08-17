const express = require('express');
const auditoriaService = require('../domain/auditoriaService');

const router = express.Router();

const ESTADO_POR_ERROR = {
  fecha_invalida: 400,
  rango_invalido: 400,
};

function responderError(res, resultado) {
  const status = ESTADO_POR_ERROR[resultado.error] || 400;
  return res.status(status).json({ exito: false, mensaje: resultado.mensaje });
}

// Consulta de solo lectura del registro de auditoría, con filtros básicos
// por fecha (calendario colombiano), tipo de acción y usuario.
router.get('/auditoria', (req, res) => {
  const { desde, hasta, accion, usuario } = req.query;
  const resultado = auditoriaService.listarEventos({ desde, hasta, accion, usuario });
  if (!resultado.exito) return responderError(res, resultado);
  return res.json(resultado);
});

// Catálogo de acciones auditables, para poblar el filtro del frontend sin
// tener que hardcodear la lista de valores posibles en dos lugares.
router.get('/auditoria/acciones', (req, res) => {
  return res.json({ exito: true, acciones: Object.values(auditoriaService.ACCIONES) });
});

module.exports = router;
