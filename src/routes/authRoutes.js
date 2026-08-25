const express = require('express');
const authService = require('../domain/authService');
const sesionService = require('../domain/sesionService');
const recuperacionService = require('../domain/recuperacionService');
const auditoriaService = require('../domain/auditoriaService');
const { ACCIONES } = auditoriaService;
const requiereSesion = require('./middlewares/requiereSesion');

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

// Logout del lado del servidor: invalida el token de inmediato en vez de
// dejar que siga siendo válido hasta que expiren sus 12 horas. Protegida
// por requiereSesion porque necesita saber CUÁL token invalidar (el de
// quien está llamando) — no tendría sentido como ruta pública.
router.post('/logout', requiereSesion, (req, res) => {
  const encabezado = req.headers.authorization || '';
  const [, token] = encabezado.split(' ');

  sesionService.eliminarSesion(token);

  auditoriaService.registrar({
    usuario: req.usuario,
    accion: ACCIONES.LOGOUT,
    entidad: 'usuario',
    entidadId: req.usuario.id,
    detalle: `Cierre de sesión para "${req.usuario.usuario}".`,
    ip: req.ip,
  });

  return res.json({ exito: true, mensaje: 'Sesión cerrada correctamente.' });
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

// Paso 2 del flujo en 3 pasos del frontend: valida el código SIN consumirlo,
// para poder mostrar los campos de contraseña nueva solo después de
// confirmar que el código escrito es correcto. Comparte el mismo límite de
// intentos que /recuperar-confirmar (ver el comentario en
// recuperacionService.verificarCodigo) — no es una segunda vía para
// adivinar códigos sin límite.
router.post('/recuperar-validar-codigo', (req, res) => {
  const { usuario, codigo } = req.body || {};

  if (typeof usuario !== 'string' || !usuario.trim() || typeof codigo !== 'string') {
    return res.status(400).json({ exito: false, mensaje: 'Debes indicar usuario y código.' });
  }

  const resultado = recuperacionService.validarCodigo(usuario.trim(), codigo.trim());

  if (!resultado.exito) {
    return res.status(400).json({ exito: false, mensaje: resultado.mensaje });
  }

  return res.json({ exito: true });
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
