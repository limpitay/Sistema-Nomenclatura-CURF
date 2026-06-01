const express = require('express');
const db      = require('../db');
const redis   = require('../redis');
const auth    = require('../middleware/auth');

const router  = express.Router();
const LOCK_TTL = 180; // segundos — 3 minutos

// ── GET /api/hostnames ──────────────────────────────────
// Lista todos los hostnames (con filtros opcionales)
router.get('/', auth, async (req, res) => {
  try {
    const { tipo, edificio, estado, search } = req.query;
    let query  = 'SELECT h.*, u.nombre as tecnico_nombre FROM hostnames h LEFT JOIN users u ON h.tecnico_id = u.id WHERE 1=1';
    const params = [];
    let i = 1;

    if (tipo)     { query += ` AND h.tipo = $${i++}`;                  params.push(tipo); }
    if (edificio) { query += ` AND h.edificio = $${i++}`;              params.push(edificio); }
    if (estado)   { query += ` AND h.estado = $${i++}`;                params.push(estado); }
    if (search)   { query += ` AND h.hostname ILIKE $${i++}`;          params.push(`%${search}%`); }

    query += ' ORDER BY h.created_at DESC';

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener hostnames' });
  }
});

// ── GET /api/hostnames/next ─────────────────────────────
// Devuelve el próximo número disponible para una combinación
router.get('/next', auth, async (req, res) => {
  const { tipo, edificio, piso, sector } = req.query;
  if (!tipo || !edificio || !piso) 
    return res.status(400).json({ error: 'tipo, edificio y piso son requeridos' });

  try {
    const result = await db.query(
      `SELECT hostname FROM hostnames 
       WHERE tipo = $1 AND edificio = $2 AND piso = $3 AND sector = $4
       ORDER BY created_at ASC`,
      [tipo, edificio, piso, sector || null]
    );

    // Extraer números usados
    const usedNums = result.rows.map(r => {
      const match = r.hostname.match(/(\d+)$/);
      return match ? parseInt(match[1]) : 0;
    });

    let next = 1;
    while (usedNums.includes(next)) next++;

    res.json({ next: String(next).padStart(tipo === 'AP' ? 3 : 2, '0') });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al calcular siguiente número' });
  }
});

// ── POST /api/hostnames/lock ────────────────────────────
// Reserva un hostname por 3 minutos
router.post('/lock', auth, async (req, res) => {
  const { hostname } = req.body;
  if (!hostname) return res.status(400).json({ error: 'hostname requerido' });

  const key = `lock:${hostname}`;

  // Ver si ya está bloqueado
  const existing = await redis.get(key);
  if (existing) {
    const ttl  = await redis.ttl(key);
    const data = JSON.parse(existing);
    return res.status(409).json({
      error:      'Hostname reservado por otro usuario',
      locked_by:  data.nombre,
      expires_in: ttl
    });
  }

  // Verificar que no exista ya en la DB
  const inDb = await db.query('SELECT id FROM hostnames WHERE hostname = $1', [hostname]);
  if (inDb.rows.length > 0)
    return res.status(409).json({ error: 'Hostname ya existe en la base de datos' });

  // Crear el lock
  await redis.set(key, JSON.stringify({
    nombre: req.user.nombre,
    email:  req.user.email,
    userId: req.user.id,
  }), 'EX', LOCK_TTL);

  res.json({ ok: true, hostname, expires_in: LOCK_TTL });
});

// ── DELETE /api/hostnames/lock/:hostname ────────────────
// Libera el lock manualmente
router.delete('/lock/:hostname', auth, async (req, res) => {
  await redis.del(`lock:${req.params.hostname}`);
  res.json({ ok: true });
});

// ── POST /api/hostnames ─────────────────────────────────
// Guarda el hostname definitivamente
router.post('/', auth, async (req, res) => {
  const {
    hostname, hostname_display, tipo, edificio, piso,
    sector, usuario_windows, numero_serie, notas
  } = req.body;

  if (!hostname || !tipo || !edificio || !piso)
    return res.status(400).json({ error: 'Faltan campos obligatorios' });

  try {
    // Liberar el lock si existe
    await redis.del(`lock:${hostname}`);

    const result = await db.query(
      `INSERT INTO hostnames 
        (hostname, hostname_display, tipo, edificio, piso, sector, usuario_windows, numero_serie, notas, tecnico_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [hostname, hostname_display, tipo, edificio, piso,
       sector || null, usuario_windows || null,
       numero_serie || null, notas || null, req.user.id]
    );

    // Registrar evento de alta
    await db.query(
      `INSERT INTO events (hostname_id, hostname, accion, detalle, tecnico_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [result.rows[0].id, hostname, 'Alta',
       `Registrado por ${req.user.nombre}`, req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ error: 'El hostname ya existe' });
    console.error(err);
    res.status(500).json({ error: 'Error al guardar hostname' });
  }
});

// ── PATCH /api/hostnames/:id ────────────────────────────
// Actualiza estado (reasignado / baja)
router.patch('/:id', auth, async (req, res) => {
  const { estado, notas } = req.body;
  try {
    const result = await db.query(
      `UPDATE hostnames SET estado = $1, notas = $2 WHERE id = $3 RETURNING *`,
      [estado, notas, req.params.id]
    );
    if (!result.rows.length)
      return res.status(404).json({ error: 'Hostname no encontrado' });

    await db.query(
      `INSERT INTO events (hostname_id, hostname, accion, detalle, tecnico_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [result.rows[0].id, result.rows[0].hostname,
       estado === 'baja' ? 'Baja' : 'Reasignación',
       notas || '', req.user.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar' });
  }
});

// ── GET /api/hostnames/:hostname/events ─────────────────
// Historial de un hostname
router.get('/:hostname/events', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT e.*, u.nombre as tecnico_nombre 
       FROM events e LEFT JOIN users u ON e.tecnico_id = u.id
       WHERE e.hostname = $1 ORDER BY e.created_at DESC`,
      [req.params.hostname]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

module.exports = router;