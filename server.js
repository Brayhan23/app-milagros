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
const auditoriaRoutes = require('./src/routes/auditoriaRoutes');
const auditoriaService = require('./src/domain/auditoriaService');
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
app.use('/api', requiereSesion, auditoriaRoutes);
app.use('/api', requiereSesion, backupRoutes);

const PORT = process.env.PORT || 3000;
const HOST = '127.0.0.1';
// La app es local-first: corre en el PC de la tienda y no debería ser
// alcanzable desde otros equipos de la misma red. Sin fijar el host,
// app.listen(PORT) escucha por defecto en todas las interfaces (0.0.0.0),
// lo que la expone a cualquier dispositivo en la misma WiFi/LAN — más allá
// de lo que asume el resto del proyecto ("solo localhost"). Atar el
// servidor a 127.0.0.1 hace que solo procesos del propio PC puedan
// conectarse.
app.listen(PORT, HOST, () => {
  console.log(`Servidor corriendo en http://${HOST}:${PORT}`);
  backupService.iniciarProgramacionBackup();
  auditoriaService.iniciarProgramacionPurga();
});