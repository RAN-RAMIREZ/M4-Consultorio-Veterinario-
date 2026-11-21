const express = require('express');
const router = express.Router();
const { validarSesion, permitirPerfiles } = require('../middlewares/auth');

router.get('/ping', validarSesion, (req, res) => {
  res.json({ ok: true, recurso: 'citas', usuario: req.usuario.rut });
});

module.exports = router;
