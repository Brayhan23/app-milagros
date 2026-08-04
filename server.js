require('dotenv').config();
const express = require('express');
const authRoutes = require('./src/routes/authRoutes');
const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Servidor Milagros funcionando');
});

app.use(authRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));