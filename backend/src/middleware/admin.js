// Requiere que el JWT ya haya sido verificado por middleware/auth.js (req.user seteado)
module.exports = (req, res, next) => {
  if (req.user?.rol !== 'admin')
    return res.status(403).json({ error: 'Requiere permisos de administrador' });
  next();
};
