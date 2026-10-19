const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const { equiposDelAD, ldap } = require('../ldap');

// Sección "Equipos AD": listado en vivo del AD, solo lectura (no hay rutas que escriban)
const router = express.Router();
router.use(auth);

// Caché corta en memoria: varias personas abriendo la sección no disparan una
// lectura completa del AD cada una. ?refrescar=1 (botón Actualizar) la saltea.
const DURACION = 2 * 60 * 1000;
let cache = null;

// ── GET /api/ad/equipos ─────────────────────────────────────
// Equipos de LDAP_EQUIPOS_BASE, cada uno marcado con si ya tiene nomenclatura
// en el sistema (el cruce se hace siempre en el momento, no se cachea).
router.get('/equipos', async (req, res) => {
  try {
    if (!cache || req.query.refrescar || Date.now() - cache.en > DURACION) {
      cache = { en: Date.now(), items: await equiposDelAD(), leido_en: new Date().toISOString() };
    }

    const result = await db.query('SELECT UPPER(generated_code) AS code FROM nomenclatures');
    const registrados = new Set(result.rows.map(r => r.code));

    res.json({
      base: ldap.equiposBase,
      leido_en: cache.leido_en,
      items: cache.items.map(e => ({ ...e, en_nomenclatura: registrados.has(String(e.nombre).toUpperCase()) })),
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Error LDAP (equipos):', err.message);
    res.status(502).json({
      error: err?.code === 49
        ? 'La cuenta de lectura del AD tiene usuario o contraseña incorrectos'
        : 'No se pudo consultar el AD',
    });
  }
});

module.exports = router;
