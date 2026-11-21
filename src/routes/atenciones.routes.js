const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { validarSesion, permitirPerfiles } = require('../middlewares/auth');
const Cita = require('../models/Cita');
const AtencionClinica = require('../models/AtencionClinica');

const error = (res, status, codigo, mensaje) =>
  res.status(status).json({ error: { codigo, mensaje } });

const textoValido = (valor) => typeof valor === 'string' && valor.trim().length > 0;

router.get('/ping', validarSesion, (req, res) => {
  res.json({ ok: true, recurso: 'atenciones', usuario: req.usuario.rut });
});

// HU-01: el veterinario registra la atención de una cita confirmada (RN-06, RN-09)
router.post('/', validarSesion, permitirPerfiles('veterinario'), async (req, res) => {
  const { citaId, motivoConsulta, examenFisico, diagnostico, obsEsterilizacion } = req.body ?? {};

  const faltantes = ['motivoConsulta', 'examenFisico', 'diagnostico']
    .filter((campo) => !textoValido(req.body?.[campo]));
  if (!citaId) faltantes.unshift('citaId');
  if (faltantes.length > 0) {
    return error(res, 400, 'DATOS_FALTANTES', `Faltan campos obligatorios: ${faltantes.join(', ')}`);
  }
  if (obsEsterilizacion !== undefined && obsEsterilizacion !== null && typeof obsEsterilizacion !== 'string') {
    return error(res, 400, 'DATOS_INVALIDOS', 'obsEsterilizacion debe ser texto');
  }

  if (!mongoose.isValidObjectId(citaId)) {
    return error(res, 404, 'CITA_NO_ENCONTRADA', 'La cita indicada no existe');
  }
  const cita = await Cita.findById(citaId);
  if (!cita) {
    return error(res, 404, 'CITA_NO_ENCONTRADA', 'La cita indicada no existe');
  }
  if (cita.estado !== 'confirmada') {
    return error(res, 409, 'CITA_NO_CONFIRMADA', `Solo se atiende una cita confirmada; esta cita está ${cita.estado}`);
  }

  let atencion;
  try {
    atencion = await AtencionClinica.create({
      citaId: cita._id,
      animalId: cita.animalId,
      tutorRut: cita.tutorRut,
      veterinarioRut: req.usuario.rut,
      motivoConsulta,
      examenFisico,
      diagnostico,
      obsEsterilizacion: obsEsterilizacion ?? null,
      estado: 'sellada'
    });
  } catch (err) {
    if (err.code === 11000) {
      return error(res, 409, 'ATENCION_DUPLICADA', 'Esta cita ya tiene una atención registrada');
    }
    if (err.name === 'ValidationError') {
      return error(res, 400, 'DATOS_INVALIDOS', 'Algún campo excede el largo permitido o no es válido');
    }
    throw err;
  }

  cita.estado = 'atendida';
  cita.veterinarioRut = req.usuario.rut;
  await cita.save();

  res.status(201).json(atencion);
});

module.exports = router;
