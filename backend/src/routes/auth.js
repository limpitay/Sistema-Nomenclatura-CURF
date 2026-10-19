const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const auth = require('../middleware/auth');
const { AUTH_MODE, ldap, validarCredencialesAD } = require('../ldap');
const { normalizarUsuario } = require('../utils/username');

const router = express.Router();

// Máximo 10 intentos de login cada 15 minutos por IP — mitiga fuerza bruta
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión. Probá de nuevo en unos minutos.' },
});

// Contraseña local (bcrypt). En modo ldap es opcional: solo la tienen las
// cuentas de emergencia, para poder entrar si el controlador de dominio no responde.
async function passwordLocalOk(user, password) {
  return !!user.password && bcrypt.compare(password, user.password);
}

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  const { password } = req.body;
  const username = normalizarUsuario(req.body.username);

  if (!username || !password) {
    return res.status(400).json({
      error: 'Usuario y contraseña requeridos'
    });
  }

  try {
    // Buscar usuario. Aunque el login sea por dominio, solo entra quien fue
    // dado de alta en /admin: si no está, ni se consulta al AD (así tampoco
    // se le suman intentos fallidos a cuentas del dominio ajenas al sistema).
    const result = await db.query(
      `SELECT *
       FROM users
       WHERE LOWER(username) = $1
       AND activo = true`,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'Credenciales incorrectas'
      });
    }

    const user = result.rows[0];

    let passwordOk;
    if (AUTH_MODE === 'ldap') {
      try {
        passwordOk = await validarCredencialesAD(username, password)
          || await passwordLocalOk(user, password);
      } catch (err) {
        console.error('Error LDAP:', err.message);
        if (!await passwordLocalOk(user, password)) {
          return res.status(502).json({
            error: 'No se pudo contactar al controlador de dominio'
          });
        }
        passwordOk = true;
      }
    } else {
      passwordOk = await passwordLocalOk(user, password);
    }

    if (!passwordOk) {
      console.warn(`Login fallido: ${username} desde ${req.ip}`);
      return res.status(401).json({
        error: 'Credenciales incorrectas'
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        nombre: user.nombre,
        rol: user.rol
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES
      }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        nombre: user.nombre,
        username: user.username,
        email: user.email,
        rol: user.rol
      }
    });

  } catch (err) {
    console.error("ERROR COMPLETO:");
    console.error(err);

    return res.status(500).json({
      error: "Error interno del servidor"
    });
  }
});

// GET /api/auth/config — público: le dice al login y a /admin si las
// contraseñas son las del dominio o locales.
router.get('/config', (req, res) => {
  res.json({ mode: AUTH_MODE, dominio: AUTH_MODE === 'ldap' ? ldap.dominio : null });
});

// GET /api/auth/me
router.get('/me', auth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;