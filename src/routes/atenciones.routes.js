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

router.get('/animal/:animalId', validarSesion, permitirPerfiles('veterinario', 'vecino', 'comunitario'), async (req, res) => {
  const animalId = req.params.animalId.trim();
  if (!textoValido(animalId)) {
    return error(res, 400, 'ANIMAL_INVALIDO', 'Debes indicar un animalId válido');
  }

  const filtro = { animalId };
  if (req.usuario.perfil === 'veterinario') {
    filtro.veterinarioRut = req.usuario.rut;
  } else {
    filtro.tutorRut = req.usuario.rut;
  }

  const atenciones = await AtencionClinica.find(filtro)
    .select('_id animalId createdAt')
    .sort({ createdAt: -1 })
    .lean();

  res.json({ total: atenciones.length, atenciones });
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

// Busca la atención por id; si no existe responde 404 y devuelve null
const buscarAtencion = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    error(res, 404, 'ATENCION_NO_ENCONTRADA', 'La atención indicada no existe');
    return null;
  }
  const atencion = await AtencionClinica.findById(req.params.id);
  if (!atencion) {
    error(res, 404, 'ATENCION_NO_ENCONTRADA', 'La atención indicada no existe');
    return null;
  }
  return atencion;
};

// RN-06 / RNF-03: la ficha sellada no se modifica ni se elimina
const rechazarCambio = async (req, res) => {
  const atencion = await buscarAtencion(req, res);
  if (!atencion) return;
  return error(res, 409, 'FICHA_INMUTABLE',
    'La atención clínica ya está cerrada y no puede modificarse; solo se admiten notas complementarias');
};

router.put('/:id', validarSesion, permitirPerfiles('veterinario'), rechazarCambio);
router.patch('/:id', validarSesion, permitirPerfiles('veterinario'), rechazarCambio);
router.delete('/:id', validarSesion, permitirPerfiles('veterinario'), rechazarCambio);

// RN-06: única forma de agregar información a una ficha sellada (adenda fechada y firmada)
router.post('/:id/notas', validarSesion, permitirPerfiles('veterinario'), async (req, res) => {
  const { texto } = req.body ?? {};
  if (!textoValido(texto)) {
    return error(res, 400, 'DATOS_FALTANTES', 'Falta el campo obligatorio: texto');
  }
  if (texto.trim().length > 1000) {
    return error(res, 400, 'DATOS_INVALIDOS', 'El texto de la nota no puede superar 1000 caracteres');
  }

  const atencion = await buscarAtencion(req, res);
  if (!atencion) return;

  atencion.notasComplementarias.push({ texto, veterinarioRut: req.usuario.rut });
  await atencion.save();

  const nota = atencion.notasComplementarias.at(-1);
  res.status(201).json({ atencionId: atencion._id, nota });
});

module.exports = router;
