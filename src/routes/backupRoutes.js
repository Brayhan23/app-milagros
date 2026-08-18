const express = require('express');
const backupService = require('../domain/backupService');

const router = express.Router();

// Protegida por requiereSesion: se monta bajo app.use('/api', requiereSesion,
// backupRoutes) en server.js, igual que el resto de rutas /api excepto /login.
router.post('/backup', async (req, res) => {
  const resultado = await backupService.ejecutarBackup();

  if (!resultado.exito) {
    const status = resultado.error === 'en_curso' ? 409 : 500;
    return res.status(status).json({ exito: false, mensaje: resultado.mensaje || resultado.error });
  }

  return res.json({ exito: true, archivo: resultado.archivo, tamanioBytes: resultado.tamanioBytes });
});

module.exports = router;
