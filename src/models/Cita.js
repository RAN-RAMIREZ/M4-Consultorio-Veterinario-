const mongoose = require('mongoose');

const citaSchema = new mongoose.Schema({
  animalId: { type: String, required: true, trim: true },
  tutorRut: { type: String, required: true, trim: true },
  sedeId: { type: String, required: true, trim: true },
  fechaHora: { type: Date, required: true },
  motivo: { type: String, required: true, trim: true, maxlength: 300 },
  estado: {
    type: String,
    enum: ['agendada', 'confirmada', 'atendida', 'cancelada', 'ausente'],
    default: 'agendada'
  },
  veterinarioRut: { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Cita', citaSchema);
