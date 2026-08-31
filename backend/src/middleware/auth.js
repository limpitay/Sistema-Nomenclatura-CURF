const jwt = require('jsonwebtoken');
const db = require('../db');

// Revalida el usuario contra la base en cada request (no confía ciegamente en
// el rol/estado que quedó grabado en el JWT al momento del login). Sin esto,
// desactivar a alguien o bajarle el rol de admin desde el panel no tiene
// efecto hasta que el token expira (hasta JWT_EXPIRES horas después).
module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader)
    return res.status(401).json({ error: 'Token requerido' });

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const result = await db.query(
      'SELECT id, nombre, email, rol, activo FROM users WHERE id = $1',
      [payload.id]
    );
    const user = result.rows[0];
    if (!user || !user.activo)
      return res.status(401).json({ error: 'Token inválido o expirado' });

    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
};