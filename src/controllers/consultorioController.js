// controllers/consultorioController.js
const Cita = require('../models/Cita');
const AtencionClinica = require('../models/AtencionClinica');
const { enviarError } = require('../utils/apiError');

const M1_URL = process.env.M1_URL || 'https://nucleo-tr.onrender.com/api/registro';


async function listarCitas(req, res) {
  try {
    const rawPage = req.query.page !== undefined ? Number(req.query.page) : 1;
    const rawLimit = req.query.limit !== undefined ? Number(req.query.limit) : 20;

    if (!Number.isInteger(rawPage) || rawPage < 1 || !Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 100) {
      return enviarError(
        res,
        400,
        'PAGINACION_INVALIDA',
        'Los parámetros page y limit deben ser enteros positivos (limit máximo: 100).'
      );
    }

    const page = rawPage;
    const limit = rawLimit;
    const skip = (page - 1) * limit;

    const filtro = {};

    if (['vecino', 'comunitario'].includes(req.usuario.perfil)) {
      filtro.tutorRut = req.usuario.rut;
    } else if (!['funcionario', 'veterinario'].includes(req.usuario.perfil)) {
      return enviarError(res, 403, 'PERFIL_NO_AUTORIZADO', 'El perfil no tiene permisos para consultar la agenda.');
    }

    
    const estadosValidos = ['agendada', 'confirmada', 'atendida', 'ausente', 'cancelada'];
    if (req.query.estado) {
      const estadoStr = String(req.query.estado).trim();
      if (!estadosValidos.includes(estadoStr)) {
        return enviarError(res, 400, 'ESTADO_INVALIDO', `Estado no reconocido. Valores válidos: ${estadosValidos.join(', ')}.`);
      }
      filtro.estado = estadoStr;
    }


    if (req.query.fecha) {
      const fechaStr = String(req.query.fecha).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) {
        return enviarError(res, 400, 'FECHA_INVALIDA', 'El parámetro fecha debe tener formato YYYY-MM-DD.');
      }
      const inicioDia = new Date(`${fechaStr}T00:00:00.000Z`);
      const finDia = new Date(`${fechaStr}T23:59:59.999Z`);
      filtro.fechaHora = { $gte: inicioDia, $lte: finDia };
    }


    const [total, datos] = await Promise.all([
      Cita.countDocuments(filtro),
      Cita.find(filtro)
        .sort({ fechaHora: 1 })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    const totalPaginas = Math.ceil(total / limit);

    return res.status(200).json({
      page,
      limit,
      total,
      totalPaginas,
      datos
    });
  } catch (error) {
    console.error('[listarCitas] Error:', error.message);
    return enviarError(res, 500, 'ERROR_INTERNO', 'Ocurrió un error al obtener el listado de citas.');
  }
}


async function obtenerHistorialPorAnimal(req, res) {
  try {
    const animalId = String(req.params.animalId || '').trim();


    if (!/^[A-Za-z0-9-]{2,30}$/.test(animalId)) {
      return enviarError(res, 400, 'ANIMAL_ID_INVALIDO', 'El identificador del animal tiene un formato inválido.');
    }

    const { perfil, rut } = req.usuario;

    if (!['veterinario', 'vecino', 'comunitario'].includes(perfil)) {
      return enviarError(
        res,
        403,
        'ACCESO_CLINICO_DENEGADO',
        'Solo el personal veterinario o el tutor registrado pueden acceder al historial clínico (RN-09).'
      );
    }

    const authHeader = req.headers.authorization || '';
    const respM1 = await fetch(`${M1_URL}/animales/${encodeURIComponent(animalId)}`, {
      headers: { 'Authorization': authHeader }
    });

    if (respM1.status === 404) {
      return enviarError(
        res,
        404,
        'ANIMAL_NO_ENCONTRADO',
        `El animal con identificador '${animalId}' no existe en el Registro Municipal.`
      );
    }

    if (!respM1.ok) {
      return enviarError(
        res,
        502,
        'ERROR_INTEGRACION_M1',
        'No fue posible verificar el animal con el Módulo de Registro.'
      );
    }

    const animal = await respM1.json();

    if (perfil === 'vecino' || perfil === 'comunitario') {
      const esTitular = animal.tutorRut === rut || animal.responsableRut === rut;
      if (!esTitular) {
        return enviarError(
          res,
          403,
          'TITULARIDAD_INVALIDA',
          'No tienes permisos para consultar el historial clínico de una mascota que no está a tu nombre (RN-05).'
        );
      }
    }

    const atenciones = await AtencionClinica.find({ animalId })
      .sort({ fechaHora: -1 })
      .lean();


    if (!atenciones || atenciones.length === 0) {
      return enviarError(
        res,
        404,
        'HISTORIAL_NO_ENCONTRADO',
        `No existen atenciones clínicas registradas para el animal '${animalId}'.`
      );
    }

    const historialFormateado = atenciones.map((at) => {
      const registroBase = {
        atencionId: at._id,
        animalId: at.animalId,
        fechaHora: new Date(at.fechaHora).toISOString(),
        veterinarioRut: at.veterinarioRut,
        diagnostico: at.diagnostico,
        receta: at.receta,
        vacuna: at.vacuna,
        recomiendaEsterilizacion: at.recomiendaEsterilizacion,
        notasComplementarias: (at.notasComplementarias || []).map((n) => ({
          texto: n.texto,
          veterinarioRut: n.veterinarioRut,
          fechaHora: new Date(n.fechaHora).toISOString()
        }))
      };

      if (perfil === 'veterinario') {
        registroBase.estado = at.estado;
        registroBase.anamnesis = at.anamnesis;
      }

      return registroBase;
    });

    return res.status(200).json({
      animalId: animal.animalId,
      nombre: animal.nombre || null,
      especie: animal.especie || null,
      estadoAnimal: animal.estado,
      totalAtenciones: historialFormateado.length,
      historial: historialFormateado
    });
  } catch (error) {
    console.error('[obtenerHistorialPorAnimal] Error:', error.message);
    return enviarError(res, 500, 'ERROR_INTERNO', 'Ocurrió un error al consultar el historial clínico.');
  }
}

module.exports = {
  listarCitas,
  obtenerHistorialPorAnimal
};