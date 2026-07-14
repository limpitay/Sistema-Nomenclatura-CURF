const express = require('express');
const db = require('../db');
const redis = require('../redis');
const auth = require('../middleware/auth');

const router = express.Router();
const LOCK_TTL = 180; // segundos — 3 minutos

// Mapa entre los nombres de estado que usa el front (español) y los
// que están cargados en nomenclature_states (inglés) — reflejan los 6 estados reales de la DB
const ESTADO_TO_STATE = {
  generado:   'generated',
  reasignado: 'reassigned',
  baja:       'decommissioned',
};

// ═══════════════════════════════════════════════════════════════
// ENDPOINTS DE CATÁLOGOS (para los desplegables del Builder)
// ═══════════════════════════════════════════════════════════════

// GET /api/nomenclatures/catalogs/buildings
router.get('/catalogs/buildings', async (req, res) => {
  try {
    const result = await db.query('SELECT id, code, name FROM buildings ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener edificios' });
  }
});

// GET /api/nomenclatures/catalogs/device-types
router.get('/catalogs/device-types', async (req, res) => {
  try {
    const result = await db.query('SELECT id, code, name FROM device_types ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener tipos de dispositivo' });
  }
});

// GET /api/nomenclatures/catalogs/floors/:buildingId
router.get('/catalogs/floors/:buildingId', async (req, res) => {
  try {
    const { buildingId } = req.params;
    const result = await db.query(
      'SELECT id, code, number, name FROM floors WHERE building_id = $1 ORDER BY number ASC',
      [buildingId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener pisos' });
  }
});

// GET /api/nomenclatures/catalogs/sectors
// Catálogo global: todos los sectores, sin depender de piso/edificio
router.get('/catalogs/sectors', async (req, res) => {
  try {
    const result = await db.query('SELECT id, code, name, description FROM sectors ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener sectores' });
  }
});

// ═══════════════════════════════════════════════════════════════
// ENDPOINTS CON AUTENTICACIÓN
// ═══════════════════════════════════════════════════════════════

// ── GET /api/nomenclatures ──────────────────────────────────
// Lista todos los nomenclatures (con filtros opcionales)
router.get('/', auth, async (req, res) => {
  try {
    const { tipo, edificio, estado, search } = req.query;
    let query  = `
      SELECT n.*, b.name as building_name, dt.name as device_type_name,
             s.name as sector_name, ns.state as state_name,
             u.nombre as creador_nombre -- Traemos el nombre del creador de la nomenclatura
      FROM nomenclatures n
      LEFT JOIN buildings b            ON n.building_id = b.id
      LEFT JOIN device_types dt        ON n.device_type_id = dt.id
      LEFT JOIN sectors s              ON n.sector_id = s.id
      LEFT JOIN nomenclature_states ns ON n.state_id = ns.id
      LEFT JOIN users u                ON n.created_by = u.id -- JOIN agregado
      WHERE 1=1`;
    const params = [];
    let i = 1;

    if (tipo)     { query += ` AND n.device_type_id = $${i++}`;     params.push(tipo); }
    if (edificio) { query += ` AND n.building_id = $${i++}`;        params.push(edificio); }
    if (estado) {
      const stateName = ESTADO_TO_STATE[estado] || estado; // acepta español o el nombre real
      query += ` AND ns.state = $${i++}`;
      params.push(stateName);
    }
    if (search)   {
      query += ` AND (n.generated_code ILIKE $${i} OR b.name ILIKE $${i} OR s.name ILIKE $${i})`;
      params.push(`%${search}%`);
      i++;
    }

    query += ' ORDER BY n.created_at DESC';

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener nomenclatures' });
  }
});

// ── POST /api/nomenclatures ─────────────────────────────────
// Guarda el registro definitivamente
router.post('/', auth, async (req, res) => {
  const { hostname, tipo, edificio, sector, sequential_number } = req.body;

  if (!hostname || !tipo || !edificio || !sequential_number)
    return res.status(400).json({ error: 'Faltan campos obligatorios' });

  try {
    await redis.del(`lock:${hostname}`);

    // Agregamos 'created_by' en las columnas y el parámetro $6
    const result = await db.query(
      `INSERT INTO nomenclatures
        (generated_code, building_id, device_type_id, sector_id, sequential_number, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [hostname, edificio, tipo, sector || null, sequential_number, req.user.id] // req.user.id asigna al creador
    );

    const nomenclature = result.rows[0];

    // Registrar alta en el historial (state 1 = 'generated')
    await db.query(
      `INSERT INTO nomenclature_history (nomenclature_id, state_id, changed_by, change_reason)
       VALUES ($1, $2, $3, $4)`,
      [nomenclature.id, nomenclature.state_id, req.user.id, 'Alta inicial']
    );

    // Registrar en audit_log
    await db.query(
      `INSERT INTO audit_log (nomenclature_id, action_type, performed_by, details)
       VALUES ($1, $2, $3, $4)`,
      [nomenclature.id, 'created', req.user.id, JSON.stringify({ generated_code: hostname })]
    );

    res.status(201).json(nomenclature);
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ error: 'El código ya existe' });
    console.error(err);
    res.status(500).json({ error: 'Error al guardar nomenclature' });
  }
});

// ── GET /api/nomenclatures/next ─────────────────────────────
// Próximo número secuencial disponible para tipo+edificio+sector
router.get('/next', auth, async (req, res) => {
  const { tipo, edificio, sector } = req.query;
  if (!tipo || !edificio)
    return res.status(400).json({ error: 'tipo y edificio son requeridos' });

  try {
    // Si viene sector, el contador es Edificio+Sector+Tipo (PC, NB, etc.)
    // Si NO viene sector, el contador es solo Edificio+Tipo (TT, LL, CAM)
    const query = sector
      ? `SELECT sequential_number FROM nomenclatures
         WHERE device_type_id = $1 AND building_id = $2 AND sector_id = $3
         ORDER BY sequential_number ASC`
      : `SELECT sequential_number FROM nomenclatures
         WHERE device_type_id = $1 AND building_id = $2
         ORDER BY sequential_number ASC`;
    const params = sector ? [tipo, edificio, sector] : [tipo, edificio];

    const result = await db.query(query, params);

    const usedNums = result.rows.map(r => r.sequential_number);
    let next = 1;
    while (usedNums.includes(next)) next++;

    res.json({ next: String(next).padStart(2, '0') });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al calcular siguiente número' });
  }
});

// ── POST /api/nomenclatures/lock ────────────────────────────
// Reserva un hostname por 3 minutos (Redis)
router.post('/lock', auth, async (req, res) => {
  const { hostname } = req.body;
  if (!hostname) return res.status(400).json({ error: 'hostname requerido' });

  const key = `lock:${hostname}`;

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

  const inDb = await db.query('SELECT id FROM nomenclatures WHERE generated_code = $1', [hostname]);
  if (inDb.rows.length > 0)
    return res.status(409).json({ error: 'Hostname ya existe en la base de datos' });

  await redis.set(key, JSON.stringify({
    nombre: req.user.nombre,
    email:  req.user.email,
    userId: req.user.id,
  }), 'EX', LOCK_TTL);

  res.json({ ok: true, hostname, expires_in: LOCK_TTL });
});

// ── DELETE /api/nomenclatures/lock/:hostname ────────────────
// Libera el lock manualmente
router.delete('/lock/:hostname', auth, async (req, res) => {
  await redis.del(`lock:${req.params.hostname}`);
  res.json({ ok: true });
});

// ── PATCH /api/nomenclatures/:id ────────────────────────────
// Cambia el estado (reasignado / baja) de una nomenclature
router.patch('/:id', auth, async (req, res) => {
  const { estado, notas } = req.body;
  const stateName = ESTADO_TO_STATE[estado];
  if (!stateName)
    return res.status(400).json({ error: 'Estado inválido' });

  try {
    const stateRow = await db.query('SELECT id FROM nomenclature_states WHERE state = $1', [stateName]);
    if (!stateRow.rows.length)
      return res.status(400).json({ error: 'Estado no configurado en la base de datos' });
    const stateId = stateRow.rows[0].id;

    const result = await db.query(
      `UPDATE nomenclatures SET state_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
      [stateId, req.params.id]
    );
    if (!result.rows.length)
      return res.status(404).json({ error: 'Nomenclature no encontrada' });

    await db.query(
      `INSERT INTO nomenclature_history (nomenclature_id, state_id, changed_by, change_reason, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.params.id, stateId, req.user.id, `Cambio de estado a ${estado}`, notas || null]
    );

    await db.query(
      `INSERT INTO audit_log (nomenclature_id, action_type, performed_by, details)
       VALUES ($1, $2, $3, $4)`,
      [req.params.id, 'state_change', req.user.id, JSON.stringify({ estado, notas: notas || null })]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar' });
  }
});

// ── GET /api/nomenclatures/:hostname/events ─────────────────
// Historial de estados de una nomenclature (buscada por su código)
router.get('/:hostname/events', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT h.id, h.changed_at as created_at, h.change_reason as accion,
              h.notes as detalle, u.nombre as tecnico_nombre
       FROM nomenclature_history h
       JOIN nomenclatures n     ON h.nomenclature_id = n.id
       LEFT JOIN users u        ON h.changed_by = u.id
       WHERE n.generated_code = $1
       ORDER BY h.changed_at DESC`,
      [req.params.hostname]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

module.exports = router;