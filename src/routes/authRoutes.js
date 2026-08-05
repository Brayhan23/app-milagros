const express = require('express');
const authService = require('../domain/authService');

const router = express.Router();

router.post('/login', (req, res) => {
  const { usuario, password } = req.body || {};

  if (typeof usuario !== 'string' || typeof password !== 'string' || !usuario.trim() || !password) {
    return res.status(400).json({ exito: false, mensaje: 'Debes enviar usuario y password.' });
  }

  const resultado = authService.login(usuario.trim(), password);

  if (!resultado.exito) {
    const status = resultado.error === 'bloqueado' ? 429 : 401;
    return res.status(status).json({ exito: false, mensaje: resultado.mensaje });
  }

  return res.json({ exito: true, usuario: resultado.usuario });
});

module.exports = router;
