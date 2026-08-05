require('dotenv').config();
const express = require('express');
const authRoutes = require('./src/routes/authRoutes');
const backupRoutes = require('./src/routes/backupRoutes');
const backupService = require('./src/domain/backupService');
const productosRoutes = require('./src/routes/productosRoutes');
const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Servidor Milagros funcionando');
});

app.use(authRoutes);
app.use(backupRoutes);
app.use(productosRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  backupService.iniciarProgramacionBackup();
});