const express = require('express');
const router = express.Router();

const { validarSesion, permitirPerfiles } = require('../middlewares/auth');

const {
  crearReceta,
  obtenerRecetas
} = require('../controllers/recetaController');

router.post(
  '/',
  validarSesion,
  permitirPerfiles('veterinario'),
  crearReceta
);

router.get(
  '/:atencionId',
  validarSesion,
  permitirPerfiles('veterinario', 'vecino', 'comunitario'),
  obtenerRecetas
);

module.exports = router;
