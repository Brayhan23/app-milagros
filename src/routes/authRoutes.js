const express = require('express');
const authService = require('../domain/authService');
const sesionService = require('../domain/sesionService');

const router = express.Router();

router.post('/login', (req, res) => {
  const { usuario, password } = req.body || {};

  if (typeof usuario !== 'string' || typeof password !== 'string' || !usuario.trim() || !password) {
    return res.status(400).json({ exito: false, mensaje: 'Debes enviar usuario y password.' });
  }

  const resultado = authService.login(usuario.trim(), password, req.ip);

  if (!resultado.exito) {
    const status = resultado.error === 'bloqueado' ? 429 : 401;
    return res.status(status).json({ exito: false, mensaje: resultado.mensaje });
  }

  const token = sesionService.crearSesion(resultado.usuario);

  return res.json({ exito: true, usuario: resultado.usuario, token });
});

module.exports = router;
