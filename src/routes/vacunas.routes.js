const express = require('express');
const router = express.Router();

const { validarSesion, permitirPerfiles } = require('../middlewares/auth');

const {
  crearVacuna,
  obtenerVacunas
} = require('../controllers/vacunaController');

router.post(
  '/',
  validarSesion,
  permitirPerfiles('veterinario'),
  crearVacuna
);

router.get(
  '/:atencionId',
  validarSesion,
  permitirPerfiles('veterinario', 'vecino'),
  obtenerVacunas
);

module.exports = router;
