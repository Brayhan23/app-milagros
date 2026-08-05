const express = require('express');
const backupService = require('../domain/backupService');

const router = express.Router();

// Sin autenticación: ninguna ruta del proyecto la tiene todavía (no hay
// middleware de sesión/token). Queda igual de expuesto que /login por ahora.
router.post('/backup', async (req, res) => {
  const resultado = await backupService.ejecutarBackup();

  if (!resultado.exito) {
    const status = resultado.error === 'en_curso' ? 409 : 500;
    return res.status(status).json({ exito: false, mensaje: resultado.mensaje || resultado.error });
  }

  return res.json({ exito: true, archivo: resultado.archivo, tamanioBytes: resultado.tamanioBytes });
});

module.exports = router;
