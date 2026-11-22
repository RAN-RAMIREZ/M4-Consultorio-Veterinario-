const express = require('express');
const router = express.Router();
const Cita = require('../models/Cita');
const { validarSesion, permitirPerfiles } = require('../middlewares/auth');

const ACTIVOS = ['agendada', 'confirmada'];
const DESTINOS = ['confirmada', 'cancelada', 'ausente'];
const STAFF = ['funcionario', 'veterinario', 'jefatura', 'admin'];

const esTexto = (v) => typeof v === 'string' && v.trim().length > 0;
const fallar = (res, status, codigo, mensaje) => res.status(status).json({ error: { codigo, mensaje } });

async function consultarM1(ruta, codigo404, msg404) {
  let resp;
  try {
    resp = await fetch(`${process.env.NUCLEO_URL}${ruta}`, { signal: AbortSignal.timeout(10000) });
  } catch {
    return { err: [503, 'M1_NO_DISPONIBLE', 'No se pudo conectar con M1'] };
  }
  if (resp.status === 404) return { err: [404, codigo404, msg404] };
  if (!resp.ok) return { err: [503, 'M1_NO_DISPONIBLE', 'Error inesperado al consultar M1'] };
  return { data: await resp.json() };
}

// GET /api/consultorio/citas
router.get('/', validarSesion, permitirPerfiles('vecino', 'comunitario', ...STAFF), async (req, res) => {
  const filtro = {};
  if (!STAFF.includes(req.usuario.perfil)) filtro.tutorRut = req.usuario.rut;
  else if (esTexto(req.query.tutorRut)) filtro.tutorRut = req.query.tutorRut.trim();

  if (esTexto(req.query.estado)) filtro.estado = req.query.estado.trim();
  if (esTexto(req.query.sedeId)) filtro.sedeId = req.query.sedeId.trim();

  const citas = await Cita.find(filtro).sort({ fechaHora: 1 }).select('-__v');
  res.json({ citas });
});

// POST /api/consultorio/citas
router.post('/', validarSesion, permitirPerfiles('vecino', 'comunitario', 'funcionario'), async (req, res) => {
  const { animalId, sedeId, fechaHora, motivo, tutorRut } = req.body;
  if (![animalId, sedeId, fechaHora, motivo].every(esTexto)) {
    return fallar(res, 400, 'DATOS_INCOMPLETOS', 'animalId, sedeId, fechaHora y motivo son obligatorios');
  }

  const fechaCita = new Date(fechaHora);
  if (Number.isNaN(fechaCita.getTime())) return fallar(res, 400, 'FECHA_INVALIDA', 'fechaHora debe ser ISO 8601');
  if (fechaCita <= new Date()) return fallar(res, 400, 'FECHA_PASADA', 'La cita debe ser en fecha y hora futura');
  if (![0, 30].includes(fechaCita.getUTCMinutes()) || fechaCita.getUTCSeconds() !== 0) {
    return fallar(res, 400, 'BLOQUE_INVALIDO', 'Solo bloques exactos de 30 minutos (:00 o :30)');
  }

  const esTutor = ['vecino', 'comunitario'].includes(req.usuario.perfil);
  const rut = esTutor ? req.usuario.rut : (esTexto(tutorRut) ? tutorRut.trim() : null);
  if (!rut) return fallar(res, 400, 'TUTOR_REQUERIDO', 'Un funcionario debe indicar un tutorRut válido');

  // 1. Validar animal y tutor en M1
  const resAnimal = await consultarM1(`/api/registro/animales/${encodeURIComponent(animalId.trim())}`, 'ANIMAL_NO_ENCONTRADO', 'Animal no existe en M1');
  if (resAnimal.err) return fallar(res, ...resAnimal.err);

  const animal = resAnimal.data;
  if (animal.estado === 'fallecido') return fallar(res, 409, 'ANIMAL_FALLECIDO', 'Animal fallecido');

  const dueño = animal.tutorRut || animal.responsableRut || animal.tutor?.rut;
  const comunitario = animal.tipo === 'comunitario' || animal.esComunitario === true;
  if (esTutor && !comunitario && dueño !== req.usuario.rut) {
    return fallar(res, 403, 'ANIMAL_NO_PERTENECE', 'No tienes permiso para agendar este animal');
  }

  const resTutor = await consultarM1(`/api/registro/tutores/${encodeURIComponent(rut)}`, 'TUTOR_NO_ENCONTRADO', 'Tutor no existe en M1');
  if (resTutor.err) return fallar(res, ...resTutor.err);
  if (resTutor.data.prohibicionTenencia === true) {
    return fallar(res, 409, 'PROHIBICION_TENENCIA', 'Tutor con prohibición de tenencia');
  }

  // 2. Validar límites y disponibilidad en paralelo
  const [citasAnimal, citasTutor, ocupado] = await Promise.all([
    Cita.countDocuments({ animalId: animalId.trim(), estado: { $in: ACTIVOS } }),
    Cita.countDocuments({ tutorRut: rut, estado: { $in: ACTIVOS } }),
    Cita.findOne({ sedeId: sedeId.trim(), fechaHora: fechaCita, estado: { $in: ACTIVOS } })
  ]);

  if (citasAnimal >= 2) return fallar(res, 409, 'LIMITE_CITAS_ANIMAL', 'Máximo 2 citas activas por animal');
  if (citasTutor >= 2) return fallar(res, 409, 'LIMITE_CITAS_TUTOR', 'Máximo 2 citas activas por tutor');
  if (ocupado) return fallar(res, 409, 'BLOQUE_NO_DISPONIBLE', 'Bloque horario ocupado en esa sede');

  const nuevaCita = await Cita.create({
    animalId: animalId.trim(),
    tutorRut: rut,
    sedeId: sedeId.trim(),
    fechaHora: fechaCita,
    motivo: motivo.trim(),
    estado: 'agendada'
  });

  res.status(201).json(nuevaCita);
});

// PATCH /api/consultorio/citas/:id/estado
router.patch('/:id/estado', validarSesion, permitirPerfiles('vecino', 'comunitario', 'funcionario', 'veterinario'), async (req, res) => {
  const { estado } = req.body;
  if (!esTexto(estado) || !DESTINOS.includes(estado)) {
    return fallar(res, 400, 'ESTADO_INVALIDO', 'Estado debe ser confirmada, cancelada o ausente');
  }

  const cita = await Cita.findById(req.params.id);
  if (!cita) return fallar(res, 404, 'CITA_NO_ENCONTRADA', 'La cita no existe');

  if (['vecino', 'comunitario'].includes(req.usuario.perfil)) {
    if (cita.tutorRut !== req.usuario.rut) return fallar(res, 403, 'CITA_NO_PERTENECE', 'No puedes modificar esta cita');
    if (estado === 'ausente') return fallar(res, 403, 'PERFIL_NO_AUTORIZADO', 'Solo staff puede marcar ausencia');
  }

  if (!ACTIVOS.includes(cita.estado)) {
    return fallar(res, 409, 'TRANSICION_NO_PERMITIDA', `No se puede cambiar desde estado ${cita.estado}`);
  }

  cita.estado = estado;
  await cita.save();
  res.json(cita);
});

module.exports = router;
