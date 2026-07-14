const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  console.log("\n========== LOGIN ==========");
  console.log("Body recibido:", req.body);

  if (!email || !password) {
    return res.status(400).json({
      error: 'Email y contraseña requeridos'
    });
  }

  try {
    // Buscar usuario
    const result = await db.query(
      `SELECT *
       FROM users
       WHERE email = $1
       AND activo = true`,
      [email]
    );

    console.log("Cantidad de usuarios encontrados:", result.rows.length);

    if (result.rows.length === 0) {
      console.log("Usuario no encontrado");
      return res.status(401).json({
        error: 'Credenciales incorrectas'
      });
    }

    const user = result.rows[0];

    console.log("Usuario obtenido desde PostgreSQL:");
    console.log(user);

    console.log("Hash almacenado:");
    console.log(user.password);

    const passwordOk = await bcrypt.compare(
      password,
      user.password
    );

    console.log("Resultado bcrypt:", passwordOk);

    if (!passwordOk) {
      return res.status(401).json({
        error: 'Credenciales incorrectas'
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        rol: user.rol
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES
      }
    );

    console.log("JWT generado correctamente");

    return res.json({
      token,
      user: {
        id: user.id,
        nombre: user.nombre,
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

// GET /api/auth/me
router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      error: 'Sin token'
    });
  }

  try {
    const token = authHeader.split(' ')[1];

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    return res.json({
      user: decoded
    });

  } catch (err) {
    return res.status(401).json({
      error: 'Token inválido'
    });
  }
});

module.exports = router;