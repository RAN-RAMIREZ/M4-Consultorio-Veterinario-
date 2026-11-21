const validarSesion = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: { codigo: 'TOKEN_REQUERIDO', mensaje: 'Falta el encabezado Authorization: Bearer <token>' }
    });
  }

  try {
    const respuesta = await fetch(`${process.env.NUCLEO_URL}/api/nucleo/sesiones/actual`, {
      headers: { Authorization: authHeader },
      signal: AbortSignal.timeout(10000)
    });

    if (respuesta.status === 401) {
      return res.status(401).json({
        error: { codigo: 'TOKEN_INVALIDO', mensaje: 'El token no es válido o expiró' }
      });
    }

    if (!respuesta.ok) {
      return res.status(503).json({
        error: { codigo: 'NUCLEO_NO_DISPONIBLE', mensaje: 'El Núcleo respondió con error inesperado' }
      });
    }

    req.usuario = await respuesta.json();
    next();
  } catch (err) {
    return res.status(503).json({
      error: { codigo: 'NUCLEO_NO_DISPONIBLE', mensaje: 'Error o tiempo agotado al validar sesión con el Núcleo' }
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
