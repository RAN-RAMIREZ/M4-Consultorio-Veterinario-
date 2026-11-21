const mongoose = require('mongoose');

const notaSchema = new mongoose.Schema({
  texto: { type: String, required: true, trim: true, maxlength: 1000 },
  veterinarioRut: { type: String, required: true, trim: true },
  fecha: { type: Date, default: Date.now }
});

const atencionSchema = new mongoose.Schema({
  citaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cita', required: true, unique: true },
  animalId: { type: String, required: true, trim: true },
  tutorRut: { type: String, required: true, trim: true },
  veterinarioRut: { type: String, required: true, trim: true },
  motivoConsulta: { type: String, required: true, trim: true, maxlength: 500 },
  examenFisico: { type: String, required: true, trim: true, maxlength: 2000 },
  diagnostico: { type: String, required: true, trim: true, maxlength: 2000 },
  obsEsterilizacion: { type: String, trim: true, maxlength: 1000, default: null },
  estado: { type: String, enum: ['en_registro', 'sellada'], default: 'en_registro' },
  notasComplementarias: [notaSchema]
}, { timestamps: true });

atencionSchema.index({ animalId: 1, createdAt: -1 });

module.exports = mongoose.model('AtencionClinica', atencionSchema, 'atenciones');
