
const mongoose = require('mongoose');
const Receta = require('../models/Receta');
const AtencionClinica = require('../models/AtencionClinica');

const crearReceta = async (req, res) => {
  try {
    const { atencionId, medicamento, dosis, frecuencia, duracion } = req.body;

    if (!atencionId || !mongoose.Types.ObjectId.isValid(atencionId)) {
      return res.status(400).json({
        error: {
          codigo: 'ATENCION_ID_INVALIDO',
          mensaje: 'El identificador de atención no es válido.'
        }
      });
    }

    if (!medicamento || !dosis || !frecuencia || !duracion) {
      return res.status(400).json({
        error: {
          codigo: 'CAMPOS_OBLIGATORIOS',
          mensaje: 'Todos los campos de la receta son obligatorios.'
        }
      });
    }

    const atencion = await AtencionClinica.findById(atencionId);

    if (!atencion) {
      return res.status(404).json({
        error: {
          codigo: 'ATENCION_NO_ENCONTRADA',
          mensaje: 'No se encontró la atención clínica.'
        }
      });
    }

    if (atencion.veterinarioRut !== req.usuario.rut) {
      return res.status(403).json({
        error: {
          codigo: 'ACCESO_DENEGADO',
          mensaje: 'Solo el veterinario responsable puede registrar recetas en esta atención.'
        }
      });
    }

    const receta = await Receta.create({
      atencionId,
      medicamento,
      dosis,
      frecuencia,
      duracion,
      veterinarioRut: req.usuario.rut
    });

    return res.status(201).json({
      mensaje: 'Receta registrada correctamente.',
      receta
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: {
          codigo: 'DATOS_RECETA_INVALIDOS',
          mensaje: 'Los datos ingresados para la receta no son válidos.'
        }
      });
    }

    return res.status(500).json({
      error: {
        codigo: 'ERROR_REGISTRAR_RECETA',
        mensaje: 'No se pudo registrar la receta.'
      }
    });
  }
};

const obtenerRecetas = async (req, res) => {
  try {
    const { atencionId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(atencionId)) {
      return res.status(400).json({
        error: {
          codigo: 'ATENCION_ID_INVALIDO',
          mensaje: 'El identificador de atención no es válido.'
        }
      });
    }

    const atencion = await AtencionClinica.findById(atencionId);

    if (!atencion) {
      return res.status(404).json({
        error: {
          codigo: 'ATENCION_NO_ENCONTRADA',
          mensaje: 'No se encontró la atención clínica.'
        }
      });
    }

    const esVeterinario = req.usuario.perfil === 'veterinario' &&
      atencion.veterinarioRut === req.usuario.rut;

    const esTutor = ['vecino', 'comunitario'].includes(req.usuario.perfil) &&
      atencion.tutorRut === req.usuario.rut;

    if (!esVeterinario && !esTutor) {
      return res.status(403).json({
        error: {
          codigo: 'ACCESO_DENEGADO',
          mensaje: 'No tienes permiso para consultar estas recetas.'
        }
      });
    }

    const recetas = await Receta.find({ atencionId })
      .sort({ createdAt: -1 });

    return res.json({
      total: recetas.length,
      recetas
    });
  } catch (error) {
    return res.status(500).json({
      error: {
        codigo: 'ERROR_OBTENER_RECETAS',
        mensaje: 'No se pudieron obtener las recetas.'
      }
    });
  }
};

module.exports = {
  crearReceta,
  obtenerRecetas
};
