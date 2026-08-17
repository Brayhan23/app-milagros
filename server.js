require('dotenv').config();
const path = require('path');
const express = require('express');
const authRoutes = require('./src/routes/authRoutes');
const backupRoutes = require('./src/routes/backupRoutes');
const backupService = require('./src/domain/backupService');
const productosRoutes = require('./src/routes/productosRoutes');
const ventasRoutes = require('./src/routes/ventasRoutes');
const clientesRoutes = require('./src/routes/clientesRoutes');
const configuracionRoutes = require('./src/routes/configuracionRoutes');
const reportesRoutes = require('./src/routes/reportesRoutes');
const requiereSesion = require('./src/routes/middlewares/requiereSesion');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'src', 'public')));

// POST /api/auth/login es la única ruta pública; todo lo demás bajo /api exige sesión.
app.use('/api/auth', authRoutes);
app.use('/api', requiereSesion, productosRoutes);
app.use('/api', requiereSesion, ventasRoutes);
app.use('/api', requiereSesion, clientesRoutes);
app.use('/api', requiereSesion, configuracionRoutes);
app.use('/api', requiereSesion, reportesRoutes);
app.use('/api', requiereSesion, backupRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  backupService.iniciarProgramacionBackup();
});