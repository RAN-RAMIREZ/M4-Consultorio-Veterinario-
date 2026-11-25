const express = require('express');
const router = express.Router();
const AtencionClinica = require('../models/AtencionClinica');
const { validarSesion, permitirPerfiles } = require('../middlewares/auth');

const fallar = (res, status, codigo, mensaje) => res.status(status).json({ error: { codigo, mensaje } });

router.get('/ping', validarSesion, (req, res) => {
  res.json({ ok: true, recurso: 'historial', usuario: req.usuario.rut });
});

// GET /api/consultorio/historial/:animalId?page=1&limit=20
// HU-03: atenciones del animal, de la más reciente a la más antigua (RN-05, RN-09)
router.get('/:animalId', validarSesion, permitirPerfiles('veterinario', 'vecino', 'comunitario'), async (req, res) => {
  const animalId = req.params.animalId.trim();
  const page = req.query.page === undefined ? 1 : Number(req.query.page);
  const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    return fallar(res, 400, 'PAGINACION_INVALIDA', 'page y limit deben ser enteros positivos (limit máximo 100)');
  }

  // El animal debe existir en M1; se reenvía el token del usuario
  let resM1;
  try {
    resM1 = await fetch(`${process.env.NUCLEO_URL}/api/registro/animales/${encodeURIComponent(animalId)}`, {
      headers: { Authorization: req.headers.authorization },
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    return fallar(res, 503, 'M1_NO_DISPONIBLE', 'No se pudo conectar con M1');
  }
  if (resM1.status === 404) return fallar(res, 404, 'ANIMAL_NO_ENCONTRADO', 'El animal no existe en M1');
  if (resM1.status === 401) return fallar(res, 401, 'TOKEN_INVALIDO', 'El token no es válido o expiró');
  if (resM1.status === 403) return fallar(res, 403, 'ANIMAL_NO_PERTENECE', 'No puedes ver el historial de este animal');
  if (!resM1.ok) return fallar(res, 503, 'M1_NO_DISPONIBLE', 'Error inesperado al consultar M1');
  const animal = await resM1.json();

  // Vecino y comunitario solo ven el historial de sus propios animales
  const esVet = req.usuario.perfil === 'veterinario';
  if (!esVet && animal.tutorRut !== req.usuario.rut && animal.responsableRut !== req.usuario.rut) {
    return fallar(res, 403, 'ANIMAL_NO_PERTENECE', 'No puedes ver el historial de este animal');
  }

  const [total, atenciones] = await Promise.all([
    AtencionClinica.countDocuments({ animalId }),
    AtencionClinica.find({ animalId }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean()
  ]);

  const datos = atenciones.map((at) => ({
    atencionId: at._id,
    fechaHora: at.createdAt,
    veterinarioRut: at.veterinarioRut,
    motivoConsulta: at.motivoConsulta,
    diagnostico: at.diagnostico,
    // El examen físico es información clínica: solo la ve el veterinario (RN-09)
    examenFisico: esVet ? at.examenFisico : undefined,
    obsEsterilizacion: at.obsEsterilizacion,
    notasComplementarias: (at.notasComplementarias || []).map((n) => ({
      texto: n.texto,
      veterinarioRut: n.veterinarioRut,
      fechaHora: n.fecha
    }))
  }));

  res.json({ page, limit, total, totalPaginas: Math.ceil(total / limit), datos });
});

module.exports = router;
