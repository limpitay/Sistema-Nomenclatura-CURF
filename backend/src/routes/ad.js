const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const { equiposDelAD, ousDelAD, ldap } = require('../ldap');

// Secciones "Equipos AD" y "Áreas AD": lectura en vivo del AD (no hay rutas que escriban)
const router = express.Router();
router.use(auth);

// Caché corta en memoria: varias personas abriendo la sección no disparan una
// lectura completa del AD cada una. ?refrescar=1 (botón Actualizar) la saltea.
const DURACION = 2 * 60 * 1000;
const cache = {};

async function cacheado(clave, leer, refrescar) {
  const c = cache[clave];
  if (!c || refrescar || Date.now() - c.en > DURACION) {
    cache[clave] = { en: Date.now(), datos: await leer(), leido_en: new Date().toISOString() };
  }
  return cache[clave];
}

function errorAD(res, err, que) {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(`Error LDAP (${que}):`, err.message);
  res.status(502).json({
    error: err?.code === 49
      ? 'La cuenta de lectura del AD tiene usuario o contraseña incorrectos'
      : 'No se pudo consultar el AD',
  });
}

// ── GET /api/ad/equipos ─────────────────────────────────────
// Equipos de LDAP_EQUIPOS_BASE, más el total de nomenclaturas creadas en el
// sistema (se cuenta siempre en el momento, no se cachea).
router.get('/equipos', async (req, res) => {
  try {
    const equipos = await cacheado('equipos', equiposDelAD, req.query.refrescar);
    const result = await db.query('SELECT COUNT(*)::int AS total FROM nomenclatures');

    res.json({
      base: ldap.equiposBase,
      leido_en: equipos.leido_en,
      items: equipos.datos,
      nomenclaturas_creadas: result.rows[0].total,
    });
  } catch (err) {
    errorAD(res, err, 'equipos');
  }
});

// ── GET /api/ad/areas ───────────────────────────────────────
// OUs de LDAP_EQUIPOS_BASE (Edificio/Área/...) y los equipos, para agruparlos
// por área en el cliente. Comparte la caché de equipos con /equipos.
router.get('/areas', async (req, res) => {
  try {
    const [ous, equipos] = await Promise.all([
      cacheado('ous', ousDelAD, req.query.refrescar),
      cacheado('equipos', equiposDelAD, req.query.refrescar),
    ]);

    res.json({
      base: ldap.equiposBase,
      leido_en: equipos.leido_en,
      ous: ous.datos,
      items: equipos.datos,
    });
  } catch (err) {
    errorAD(res, err, 'áreas');
  }
});

module.exports = router;
