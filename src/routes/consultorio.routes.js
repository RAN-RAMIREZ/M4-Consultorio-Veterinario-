const express = require('express');
const router = express.Router();
const verificarTokenNucleo = require('../middlewares/authNucleo');
const {
  listarCitas,
  obtenerHistorialPorAnimal
} = require('../controllers/consultorioController');

router.get('/citas', verificarTokenNucleo, listarCitas);
router.get('/historial/:animalId', verificarTokenNucleo, obtenerHistorialPorAnimal);

module.exports = router;