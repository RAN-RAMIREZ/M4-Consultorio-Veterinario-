const express = require('express');
const router = express.Router();
const Cita = require('../models/Cita');
const { validarSesion, permitirPerfiles } = require('../middlewares/auth');

const ACTIVOS = ['agendada', 'confirmada'];
const DESTINOS = ['confirmada', 'cancelada', 'ausente'];
const STAFF = ['funcionario', 'veterinario', 'jefatura', 'admin'];

const esTexto = (v) => typeof v === 'string' && v.trim().length > 0;
const fallar = (res, status, codigo, mensaje) => res.status(status).json({ error: { codigo, mensaje } });

async function consultarM1(ruta, codigo404, msg404, authHeader) {
  let resp;
  try {
    resp = await fetch(`${process.env.NUCLEO_URL}${ruta}`, {
      headers: { Authorization: authHeader },
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    return { err: [503, 'M1_NO_DISPONIBLE', 'No se pudo conectar con M1'] };
  }
  if (resp.status === 404) return { err: [404, codigo404, msg404] };
  if (resp.status === 401) return { err: [401, 'TOKEN_INVALIDO', 'El token no es válido o expiró'] };
  if (resp.status === 403) return { err: [403, 'ACCESO_M1_DENEGADO', 'No tienes permiso sobre ese registro en M1'] };
  if (!resp.ok) return { err: [503, 'M1_NO_DISPONIBLE', 'Error inesperado al consultar M1'] };
  return { data: await resp.json() };
}

// GET /api/consultorio/citas
router.get('/', validarSesion, permitirPerfiles('vecino', 'comunitario', ...STAFF), async (req, res) => {
  const page = req.query.page === undefined ? 1 : Number(req.query.page);
  const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    return fallar(res, 400, 'PAGINACION_INVALIDA', 'page y limit deben ser enteros positivos (limit máximo 100)');
  }
  const skip = (page - 1) * limit;

  const filtro = {};

  // Vecinos y comunitarios solo ven sus propias citas
  if (!STAFF.includes(req.usuario.perfil)) {
    filtro.tutorRut = req.usuario.rut;
  } else if (esTexto(req.query.tutorRut)) {
    filtro.tutorRut = req.query.tutorRut.trim();
  }

  if (esTexto(req.query.estado)) filtro.estado = req.query.estado.trim();
  if (esTexto(req.query.sedeId)) filtro.sedeId = req.query.sedeId.trim();
  if (esTexto(req.query.animalId)) filtro.animalId = req.query.animalId.trim();

  if (esTexto(req.query.fecha)) {
    const inicio = new Date(`${req.query.fecha.trim()}T00:00:00.000Z`);
    const fin = new Date(`${req.query.fecha.trim()}T23:59:59.999Z`);
    if (!Number.isNaN(inicio.getTime())) {
      filtro.fechaHora = { $gte: inicio, $lte: fin };
    }
  }

  const [total, datos] = await Promise.all([
    Cita.countDocuments(filtro),
    Cita.find(filtro).sort({ fechaHora: 1 }).skip(skip).limit(limit)
  ]);

  const totalPaginas = Math.ceil(total / limit);

  res.json({
    page,
    limit,
    total,
    totalPaginas,
    datos
  });
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
  const resAnimal = await consultarM1(`/api/registro/animales/${encodeURIComponent(animalId.trim())}`, 'ANIMAL_NO_ENCONTRADO', 'Animal no existe en M1', req.headers.authorization);
  if (resAnimal.err) return fallar(res, ...resAnimal.err);

  const animal = resAnimal.data;
  if (animal.estado === 'fallecido') return fallar(res, 409, 'ANIMAL_FALLECIDO', 'Animal fallecido');

  const dueño = animal.tutorRut || animal.responsableRut || animal.tutor?.rut;
  const comunitario = animal.comunitario === true;
  if (esTutor && !comunitario && dueño !== req.usuario.rut) {
    return fallar(res, 403, 'ANIMAL_NO_PERTENECE', 'No tienes permiso para agendar este animal');
  }

  const resTutor = await consultarM1(`/api/registro/tutores/${encodeURIComponent(rut)}`, 'TUTOR_NO_ENCONTRADO', 'Tutor no existe en M1', req.headers.authorization);
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
  const { estado } = req.body ?? {};
  if (!esTexto(estado) || !DESTINOS.includes(estado)) {
    return fallar(res, 400, 'ESTADO_INVALIDO', 'Estado debe ser confirmada, cancelada o ausente');
  }

  const cita = await Cita.findById(req.params.id);
  if (!cita) return fallar(res, 404, 'CITA_NO_ENCONTRADA', 'La cita no existe');

  if (['vecino', 'comunitario'].includes(req.usuario.perfil)) {
    if (cita.tutorRut !== req.usuario.rut) return fallar(res, 403, 'CITA_NO_PERTENECE', 'No puedes modificar esta cita');
    if (estado === 'ausente') return fallar(res, 403, 'PERFIL_NO_AUTORIZADO', 'Solo staff puede marcar ausencia');
  }

  // RN-08: confirmar la cita es exclusivo del funcionario municipal
  if (estado === 'confirmada' && req.usuario.perfil !== 'funcionario') {
    return fallar(res, 403, 'PERFIL_NO_AUTORIZADO', 'Solo el funcionario puede confirmar citas (RN-08)');
  }

  if (!ACTIVOS.includes(cita.estado) || cita.estado === estado) {
    return fallar(res, 409, 'TRANSICION_NO_PERMITIDA', `No se puede pasar de ${cita.estado} a ${estado}`);
  }

  cita.estado = estado;
  await cita.save();
  res.json(cita);
});

module.exports = router;
