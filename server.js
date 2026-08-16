require('dotenv').config();
const path = require('path');
const express = require('express');
const authRoutes = require('./src/routes/authRoutes');
const backupRoutes = require('./src/routes/backupRoutes');
const backupService = require('./src/domain/backupService');
const productosRoutes = require('./src/routes/productosRoutes');
const ventasRoutes = require('./src/routes/ventasRoutes');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'src', 'public')));

app.use('/api/auth', authRoutes);
app.use('/api', productosRoutes);
app.use('/api', ventasRoutes);
app.use(backupRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  backupService.iniciarProgramacionBackup();
});