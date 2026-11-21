require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.disable('x-powered-by');

app.use(cors());
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, '../public')));

app.get('/api/consultorio/estado', (req, res) => {
  res.json({ ok: true, modulo: 'M4 - Consultorio Veterinario' });
});

app.use('/api/consultorio/citas', require('./routes/citas.routes'));
app.use('/api/consultorio/atenciones', require('./routes/atenciones.routes'));
app.use('/api/consultorio/historial', require('./routes/historial.routes'));
app.use('/api/consultorio/recetas', require('./routes/recetas.routes'));
app.use('/api/consultorio/vacunas', require('./routes/vacunas.routes'));

app.use((req, res) => {
  res.status(404).json({
    error: { codigo: 'RUTA_NO_ENCONTRADA', mensaje: 'El recurso solicitado no existe' }
  });
});

app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: { codigo: 'JSON_INVALIDO', mensaje: 'El cuerpo de la petición no es JSON válido' }
    });
  }
  if (err && err.name === 'CastError') {
    return res.status(404).json({
      error: { codigo: 'RECURSO_NO_ENCONTRADO', mensaje: 'El identificador proporcionado no existe' }
    });
  }
  console.error(err);
  res.status(500).json({
    error: { codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error interno' }
  });
});

const PORT = process.env.PORT || 3000;

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('Conectado a MongoDB (tr_consultorio)');
    app.listen(PORT, () => console.log(`Servidor M4 corriendo en puerto ${PORT}`));
  })
  .catch((err) => {
    console.error('Error al conectar a MongoDB:', err.message);
  });
