const sesionService = require('../../domain/sesionService');

function requiereSesion(req, res, next) {
  const encabezado = req.headers.authorization || '';
  const [tipo, token] = encabezado.split(' ');

  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ exito: false, mensaje: 'Debes iniciar sesión para acceder a este recurso.' });
  }

  const usuario = sesionService.validarToken(token);
  if (!usuario) {
    return res.status(401).json({ exito: false, mensaje: 'Sesión inválida o expirada. Vuelve a iniciar sesión.' });
  }

  req.usuario = usuario;
  next();
}

module.exports = requiereSesion;
