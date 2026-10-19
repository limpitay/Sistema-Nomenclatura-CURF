const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const auth = require('../middleware/auth');
const requireAdmin = require('../middleware/admin');
const { AUTH_MODE } = require('../ldap');
const { normalizarUsuario } = require('../utils/username');

const router = express.Router();

// Todas las rutas de este módulo requieren estar logueado Y ser admin
router.use(auth, requireAdmin);

// ── GET /api/users ──────────────────────────────────────────
// Lista usuarios (filtros opcionales: rol, estado=activo|inactivo, search)
router.get('/', async (req, res) => {
  try {
    const { rol, estado, search } = req.query;
    let query = `SELECT id, nombre, username, email, rol, activo, created_at, (password IS NOT NULL) AS tiene_password FROM users WHERE 1=1`;
    const params = [];
    let i = 1;

    if (rol)    { query += ` AND rol = $${i++}`; params.push(rol); }
    if (estado === 'activo')   { query += ` AND activo = true`; }
    if (estado === 'inactivo') { query += ` AND activo = false`; }
    if (search) {
      query += ` AND (nombre ILIKE $${i} OR username ILIKE $${i} OR email ILIKE $${i})`;
      params.push(`%${search}%`);
      i++;
    }

    query += ' ORDER BY nombre ASC';

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

// ── POST /api/users ─────────────────────────────────────────
// Crea un usuario nuevo
router.post('/', async (req, res) => {
  const { nombre, email, password, rol } = req.body;
  const username = normalizarUsuario(req.body.username);

  // Con login por dominio la contraseña es opcional: es solo una clave de
  // emergencia por si el controlador de dominio no responde.
  if (!nombre || !username || (!password && AUTH_MODE !== 'ldap'))
    return res.status(400).json({ error: 'Nombre, usuario y contraseña son obligatorios' });
  if (password && password.length < 8)
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  const rolFinal = rol || 'technician';
  if (!['admin', 'technician'].includes(rolFinal))
    return res.status(400).json({ error: 'Rol inválido' });

  try {
    const hash = password ? await bcrypt.hash(password, 10) : null;
    const result = await db.query(
      `INSERT INTO users (nombre, username, email, password, rol)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nombre, username, email, rol, activo, created_at, (password IS NOT NULL) AS tiene_password`,
      [nombre, username, email || null, hash, rolFinal]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ error: err.constraint === 'users_email_key' ? 'Ya existe un usuario con ese email' : 'Ya existe un usuario con ese nombre de usuario' });
    console.error(err);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

// ── PATCH /api/users/:id ────────────────────────────────────
// Edita nombre / rol / estado activo, y opcionalmente resetea la contraseña.
// password: null la borra (solo con login por dominio: queda sin clave local).
router.patch('/:id', async (req, res) => {
  const targetId = Number(req.params.id);
  const { nombre, username, rol, activo, password } = req.body;

  if (rol && !['admin', 'technician'].includes(rol))
    return res.status(400).json({ error: 'Rol inválido' });
  if (password && password.length < 8)
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  if (password === null && AUTH_MODE !== 'ldap')
    return res.status(400).json({ error: 'Con login local todos los usuarios necesitan contraseña' });
  if (username !== undefined && !normalizarUsuario(username))
    return res.status(400).json({ error: 'El usuario no puede quedar vacío' });

  const isSelf = req.user.id === targetId;
  if (isSelf && rol && rol !== 'admin')
    return res.status(400).json({ error: 'No podés quitarte tu propio rol de administrador' });
  if (isSelf && activo === false)
    return res.status(400).json({ error: 'No podés desactivar tu propia cuenta' });

  try {
    const fields = [];
    const params = [];
    let i = 1;

    if (nombre !== undefined)   { fields.push(`nombre = $${i++}`);   params.push(nombre); }
    if (username !== undefined) { fields.push(`username = $${i++}`); params.push(normalizarUsuario(username)); }
    if (rol !== undefined)      { fields.push(`rol = $${i++}`);      params.push(rol); }
    if (activo !== undefined)   { fields.push(`activo = $${i++}`);   params.push(activo); }
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      fields.push(`password = $${i++}`);
      params.push(hash);
    } else if (password === null) {
      fields.push('password = NULL');
    }

    if (!fields.length)
      return res.status(400).json({ error: 'No hay campos para actualizar' });

    params.push(targetId);
    const result = await db.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${i}
       RETURNING id, nombre, username, email, rol, activo, created_at, (password IS NOT NULL) AS tiene_password`,
      params
    );

    if (!result.rows.length)
      return res.status(404).json({ error: 'Usuario no encontrado' });

    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ error: err.constraint === 'users_email_key' ? 'Ya existe un usuario con ese email' : 'Ya existe un usuario con ese nombre de usuario' });
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

// ── DELETE /api/users/:id ───────────────────────────────────
// Elimina un usuario definitivamente. Las nomenclatures/historial/audit_log
// que haya generado quedan intactas: solo pierden la referencia al creador
// (las FK a users.id son ON DELETE SET NULL).
router.delete('/:id', async (req, res) => {
  const targetId = Number(req.params.id);

  if (req.user.id === targetId)
    return res.status(400).json({ error: 'No podés eliminar tu propia cuenta' });

  try {
    const result = await db.query(
      'DELETE FROM users WHERE id = $1 RETURNING id',
      [targetId]
    );
    if (!result.rows.length)
      return res.status(404).json({ error: 'Usuario no encontrado' });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
});

module.exports = router;
