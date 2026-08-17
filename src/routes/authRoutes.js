const express = require('express');
const authService = require('../domain/authService');
const sesionService = require('../domain/sesionService');
const recuperacionService = require('../domain/recuperacionService');

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

// Recuperación de contraseña: pública, igual que /login, porque quien la usa
// justamente no puede iniciar sesión. Ver recuperacionService.js para el
// diseño (código numérico por correo, nunca un enlace: la app no es
// accesible desde fuera del PC de la tienda).
router.post('/recuperar-solicitar', async (req, res) => {
  const { usuario } = req.body || {};

  if (typeof usuario !== 'string' || !usuario.trim()) {
    return res.status(400).json({ exito: false, mensaje: 'Debes indicar tu usuario o correo.' });
  }

  const resultado = await recuperacionService.solicitarRecuperacion(usuario.trim(), req.ip);

  if (!resultado.exito) {
    const status = resultado.error === 'smtp_no_configurado' ? 503 : 400;
    return res.status(status).json({ exito: false, mensaje: resultado.mensaje });
  }

  return res.json({ exito: true, mensaje: resultado.mensaje });
});

router.post('/recuperar-confirmar', (req, res) => {
  const { usuario, codigo, nuevaPassword } = req.body || {};

  if (typeof usuario !== 'string' || !usuario.trim() || typeof codigo !== 'string' || typeof nuevaPassword !== 'string') {
    return res.status(400).json({ exito: false, mensaje: 'Debes indicar usuario, código y nueva contraseña.' });
  }

  const resultado = recuperacionService.confirmarRecuperacion(
    { usuario: usuario.trim(), codigo: codigo.trim(), nuevaPassword },
    req.ip
  );

  if (!resultado.exito) {
    return res.status(400).json({ exito: false, mensaje: resultado.mensaje });
  }

  return res.json({ exito: true, mensaje: resultado.mensaje });
});

module.exports = router;
