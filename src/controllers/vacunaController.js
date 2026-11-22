
const mongoose = require('mongoose');
const Vacuna = require('../models/Vacuna');
const AtencionClinica = require('../models/AtencionClinica');

const esFechaUTCValida = (fecha) => {
  return typeof fecha === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(fecha) &&
    !Number.isNaN(Date.parse(fecha));
};

const crearVacuna = async (req, res) => {
  try {
    const {
      atencionId,
      tipo,
      lote,
      fechaAplicacion,
      proximaDosis
    } = req.body;

    if (!atencionId || !mongoose.Types.ObjectId.isValid(atencionId)) {
      return res.status(400).json({
        error: 'El identificador de atención no es válido.'
      });
    }

    if (!tipo || !lote || !fechaAplicacion) {
      return res.status(400).json({
        error: 'El tipo, lote y fecha de aplicación son obligatorios.'
      });
    }

    if (!esFechaUTCValida(fechaAplicacion)) {
      return res.status(400).json({
        error: 'La fecha de aplicación debe estar en formato ISO 8601 UTC.'
      });
    }

    if (
      proximaDosis !== undefined &&
      proximaDosis !== null &&
      !esFechaUTCValida(proximaDosis)
    ) {
      return res.status(400).json({
        error: 'La próxima dosis debe estar en formato ISO 8601 UTC.'
      });
    }

    if (
      proximaDosis &&
      new Date(proximaDosis) < new Date(fechaAplicacion)
    ) {
      return res.status(400).json({
        error: 'La próxima dosis no puede ser anterior a la aplicación.'
      });
    }

    const atencion = await AtencionClinica.findById(atencionId);

    if (!atencion) {
      return res.status(404).json({
        error: 'No se encontró la atención clínica.'
      });
    }

    const vacuna = await Vacuna.create({
      atencionId,
      tipo,
      lote,
      fechaAplicacion,
      proximaDosis: proximaDosis || null,
      veterinarioRut: req.usuario.rut
    });

    return res.status(201).json({
      mensaje: 'Vacuna registrada correctamente.',
      vacuna
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: error.message
      });
    }

    return res.status(500).json({
      error: 'No se pudo registrar la vacuna.'
    });
  }
};

const obtenerVacunas = async (req, res) => {
  try {
    const { atencionId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(atencionId)) {
      return res.status(400).json({
        error: 'El identificador de atención no es válido.'
      });
    }

    const atencion = await AtencionClinica.findById(atencionId);

    if (!atencion) {
      return res.status(404).json({
        error: 'No se encontró la atención clínica.'
      });
    }

    const esVeterinario = req.usuario.perfil === 'veterinario' &&
      atencion.veterinarioRut === req.usuario.rut;

    const esTutor = req.usuario.perfil === 'vecino' &&
      atencion.tutorRut === req.usuario.rut;

    if (!esVeterinario && !esTutor) {
      return res.status(403).json({
        error: 'No tienes permiso para consultar estas vacunas.'
      });
    }

    const vacunas = await Vacuna.find({ atencionId })
      .sort({ fechaAplicacion: -1 });

    return res.json({
      total: vacunas.length,
      vacunas
    });
  } catch (error) {
    return res.status(500).json({
      error: 'No se pudieron obtener las vacunas.'
    });
  }
};

module.exports = {
  crearVacuna,
  obtenerVacunas
};
