const validarSesion = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: { codigo: 'TOKEN_REQUERIDO', mensaje: 'Falta el encabezado Authorization: Bearer <token>' }
    });
  }

  try {
    const respuesta = await fetch(`${process.env.NUCLEO_URL}/api/nucleo/sesiones/actual`, {
      headers: { Authorization: authHeader }
    });

    if (!respuesta.ok) {
      return res.status(401).json({
        error: { codigo: 'TOKEN_INVALIDO', mensaje: 'El token no es válido o expiró' }
      });
    }

    req.usuario = await respuesta.json();
    next();
  } catch (err) {
    return res.status(503).json({
      error: { codigo: 'NUCLEO_NO_DISPONIBLE', mensaje: 'Error al validar sesión con el Núcleo' }
    });
  }
};

const permitirPerfiles = (...perfilesPermitidos) => {
  return (req, res, next) => {
    if (!req.usuario || !perfilesPermitidos.includes(req.usuario.perfil)) {
      return res.status(403).json({
        error: { codigo: 'PERFIL_NO_AUTORIZADO', mensaje: 'Tu perfil no tiene permiso para esta acción' }
      });
    }
    next();
  };
};

module.exports = { validarSesion, permitirPerfiles };
