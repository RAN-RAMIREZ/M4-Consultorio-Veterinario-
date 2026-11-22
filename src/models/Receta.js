const mongoose = require('mongoose');

const recetaSchema = new mongoose.Schema({
  atencionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AtencionClinica',
    required: true
  },
  medicamento: {
    type: String,
    required: true,
    trim: true,
    maxlength: 150
  },
  dosis: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  frecuencia: {
    type: String,
    required: true,
    trim: true,
    maxlength: 150
  },
  duracion: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  veterinarioRut: {
    type: String,
    required: true,
    trim: true
  }
}, {
  timestamps: true
});

recetaSchema.index({ atencionId: 1, createdAt: -1 });

module.exports = mongoose.model('Receta', recetaSchema, 'recetas');
