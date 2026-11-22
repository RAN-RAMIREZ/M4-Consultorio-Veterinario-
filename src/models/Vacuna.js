const mongoose = require('mongoose');

const vacunaSchema = new mongoose.Schema({
  atencionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AtencionClinica',
    required: true
  },
  tipo: {
    type: String,
    required: true,
    trim: true,
    maxlength: 150
  },
  lote: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  fechaAplicacion: {
    type: Date,
    required: true
  },
  proximaDosis: {
    type: Date,
    default: null,
    validate: {
      validator: function (fecha) {
        return !fecha || fecha >= this.fechaAplicacion;
      },
      message: 'La próxima dosis no puede ser anterior a la fecha de aplicación.'
    }
  },
  veterinarioRut: {
    type: String,
    required: true,
    trim: true
  }
}, {
  timestamps: true
});

vacunaSchema.index({ atencionId: 1, fechaAplicacion: -1 });

module.exports = mongoose.model('Vacuna', vacunaSchema, 'vacunas');
