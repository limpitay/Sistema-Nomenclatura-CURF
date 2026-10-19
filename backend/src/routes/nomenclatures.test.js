// Tests de /next y /lock con la ruta real de Express. Se simulan la base,
// Redis, el AD y el login; la lógica de la ruta corre tal cual.
const express = require('express');
const request = require('supertest');

jest.mock('../db', () => ({ query: jest.fn() }));
jest.mock('../redis', () => ({ set: jest.fn(), get: jest.fn(), ttl: jest.fn(), del: jest.fn() }));
jest.mock('../ldap', () => ({ equipoEnAD: jest.fn(), nombresEquiposAD: jest.fn() }));
jest.mock('../hikcentral', () => ({
  ...jest.requireActual('../hikcentral'),
  estadoCamaras: jest.fn(), reservarCamara: jest.fn(), anularCamara: jest.fn(),
}));
jest.mock('../middleware/auth', () => (req, res, next) => {
  req.user = { id: 1, nombre: 'Técnico Test', email: null };
  next();
});

const db = require('../db');
const redis = require('../redis');
const { equipoEnAD, nombresEquiposAD } = require('../ldap');
const { estadoCamaras, reservarCamara, anularCamara } = require('../hikcentral');
const router = require('./nomenclatures');

const app = express();
app.use(express.json());
app.use('/api/nomenclatures', router);

// ── Base simulada ───────────────────────────────────────────
const TIPOS = { 1: 'PC', 3: 'CAM', 4: 'TT', 6: 'FID' };
const EDIFICIOS = { 1: 'JR', 2: 'ON', 6: 'LI' };
const SECTORES = { 5: 'AUD' };
const PISOS = [
  { id: 1, building_id: 1, code: 'PB' }, { id: 2, building_id: 1, code: 'P1' },
  { id: 5, building_id: 1, code: 'P3' }, { id: 3, building_id: 2, code: 'PB' },
];

// Estado del generador CAM que devuelve HikCentral
const estadoHik = (nextJR, unreachableNvrs = []) => ({
  buildings: [{ code: 'JR', name: 'Jacinto Rios', nextNumber: nextJR }, { code: 'ON', name: 'Oncativo', nextNumber: nextJR }],
  floors: ['SS', 'PB', 'P1', 'P2', 'P3'],
  reservations: [],
  unreachableNvrs,
});

let usadosEnBase;   // sequential_number que devuelve la base para /next
let hostnamesEnBase; // generated_code que ya existen (para /lock)

const filas = (arr) => ({ rows: arr });

db.query.mockImplementation(async (sql, params = []) => {
  if (/FROM device_types WHERE code <> ALL/.test(sql))
    return filas(Object.entries(TIPOS).filter(([, code]) => !params[0].includes(code)).map(([id, code]) => ({ id: Number(id), code })));
  if (/FROM device_types WHERE id/.test(sql))
    return filas(TIPOS[params[0]] ? [{ code: TIPOS[params[0]] }] : []);
  if (/SELECT sequential_number FROM nomenclatures/.test(sql))
    return filas(usadosEnBase.map(n => ({ sequential_number: n })));
  if (/FROM buildings WHERE id/.test(sql))
    return filas(EDIFICIOS[params[0]] ? [{ code: EDIFICIOS[params[0]] }] : []);
  if (/SELECT code FROM buildings/.test(sql))
    return filas(Object.values(EDIFICIOS).map(code => ({ code })));
  if (/FROM sectors WHERE id/.test(sql))
    return filas(SECTORES[params[0]] ? [{ code: SECTORES[params[0]] }] : []);
  if (/SELECT DISTINCT code FROM floors/.test(sql))
    return filas([...new Set(PISOS.map(p => p.code))].map(code => ({ code })));
  if (/FROM floors WHERE building_id/.test(sql))
    return filas(PISOS.filter(p => p.building_id === Number(params[0])).map(({ code }) => ({ code })));
  if (/FROM floors WHERE id/.test(sql))
    return filas(PISOS.filter(p => p.id === Number(params[0])).map(({ code }) => ({ code })));
  if (/INSERT INTO nomenclatures/.test(sql)) {
    if (hostnamesEnBase.includes(params[0])) throw Object.assign(new Error('duplicado'), { code: '23505' });
    return filas([{ id: 10, generated_code: params[0], state_id: 1 }]);
  }
  if (/INSERT INTO (nomenclature_history|audit_log)/.test(sql)) return filas([]);
  if (/SELECT id FROM nomenclatures WHERE generated_code/.test(sql))
    return filas(hostnamesEnBase.includes(params[0]) ? [{ id: 99 }] : []);
  throw new Error(`Query no simulada en el test: ${sql}`);
});

beforeEach(() => {
  usadosEnBase = [];
  hostnamesEnBase = [];
  equipoEnAD.mockReset().mockResolvedValue(null);
  nombresEquiposAD.mockReset().mockResolvedValue([]);
  redis.set.mockReset().mockResolvedValue('OK');
  redis.get.mockReset().mockResolvedValue(null);
  redis.ttl.mockReset().mockResolvedValue(0);
  redis.del.mockReset().mockResolvedValue(1);
  db.query.mockClear(); // conserva la base simulada, borra las llamadas del test anterior
  estadoCamaras.mockReset().mockResolvedValue(estadoHik(1));
  reservarCamara.mockReset().mockResolvedValue({});
  anularCamara.mockReset().mockResolvedValue({ ok: true });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

const next = (query) => request(app).get('/api/nomenclatures/next').query(query);
const lock = (body) => request(app).post('/api/nomenclatures/lock').send(body);
const guardar = (body) => request(app).post('/api/nomenclatures').send(body);

// ═══════════════════════════════════════════════════════════
describe('GET /next — número sugerido', () => {
  test('PC: saltea los números usados en la base y en el AD (cualquier piso)', async () => {
    usadosEnBase = [1, 2];
    nombresEquiposAD.mockResolvedValue([
      'JRPBAUDPC01', 'JRP1AUDPC03', 'JRP1AUDPC04', // cuentan: mismo edificio+sector+tipo
      'JRP1AUDNB09',                              // otro tipo: no cuenta
      'JRP1AUDPC07-OLD',                          // no respeta el formato: no cuenta
    ]);

    const res = await next({ tipo: 1, edificio: 1, sector: 5 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ next: '05', ad_verificado: true });
    expect(nombresEquiposAD).toHaveBeenCalledWith(['JR', 'AUDPC']);
  });

  test('PC: rellena huecos considerando base + AD', async () => {
    usadosEnBase = [1];
    nombresEquiposAD.mockResolvedValue(['JRPBAUDPC03']);

    const res = await next({ tipo: 1, edificio: 1, sector: 5 });

    expect(res.body.next).toBe('02');
  });

  test('TT: correlativo global, cuenta los de cualquier edificio en el AD', async () => {
    nombresEquiposAD.mockResolvedValue(['TTPBJR01', 'TTPBON02']);

    const res = await next({ tipo: 4, edificio: 1 });

    expect(res.body).toEqual({ next: '03', ad_verificado: true });
    expect(nombresEquiposAD).toHaveBeenCalledWith(['TT']);
  });

  test('CAM: el número lo da HikCentral (no la base ni el AD)', async () => {
    usadosEnBase = [1, 2, 3];
    estadoCamaras.mockResolvedValue(estadoHik(31));

    const res = await next({ tipo: 3, edificio: 1 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ next: '31', ad_verificado: null, aviso_hik: null });
    expect(nombresEquiposAD).not.toHaveBeenCalled();
  });

  test('CAM: avisa si algún NVR no responde', async () => {
    estadoCamaras.mockResolvedValue(estadoHik(4, ['NVR-JR-1']));

    const res = await next({ tipo: 3, edificio: 1 });

    expect(res.body.aviso_hik).toMatch(/No responde NVR-JR-1/);
  });

  test('CAM: edificio que HikCentral no numera', async () => {
    const res = await next({ tipo: 3, edificio: 6 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('El panel de Cámaras no numera cámaras de LI');
  });

  test('CAM: HikCentral caído, no sugiere número', async () => {
    estadoCamaras.mockRejectedValue(Object.assign(new Error('HikCentral no respondió (ECONNREFUSED)'), { status: 502 }));

    const res = await next({ tipo: 3, edificio: 1 });

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/HikCentral no respondió/);
  });

  test('AD caído: sugiere solo con la base y avisa que no se verificó', async () => {
    usadosEnBase = [1, 2];
    nombresEquiposAD.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const res = await next({ tipo: 1, edificio: 1, sector: 5 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ next: '03', ad_verificado: false });
  });
});

// ═══════════════════════════════════════════════════════════
describe('POST /lock — reservar', () => {
  test('libre en base y AD: reserva sin aviso', async () => {
    const res = await lock({ hostname: 'JRPBAUDPC05', tipo: 1 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, hostname: 'JRPBAUDPC05', aviso_ad: null });
    expect(equipoEnAD).toHaveBeenCalledWith('JRPBAUDPC05');
    expect(redis.set).toHaveBeenCalled();
  });

  test('existe en el AD: rechaza con la ubicación y el último login, y no reserva', async () => {
    equipoEnAD.mockResolvedValue({
      nombre: 'JRPBAUDPC01', ubicacion: 'curf.net/CURF/Equipos/PC',
      habilitado: true, ultimo_login: '2026-10-14T15:00:00.000Z',
    });

    const res = await lock({ hostname: 'JRPBAUDPC01', tipo: 1 });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('JRPBAUDPC01 ya existe en el AD (curf.net/CURF/Equipos/PC · último login 14/10/2026)');
    expect(redis.set).not.toHaveBeenCalled();
  });

  test('existe deshabilitado en el AD: cuenta como ocupado y lo aclara', async () => {
    equipoEnAD.mockResolvedValue({
      nombre: 'JRPBAUDPC02', ubicacion: 'curf.net/Computers', habilitado: false, ultimo_login: null,
    });

    const res = await lock({ hostname: 'JRPBAUDPC02', tipo: 1 });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('JRPBAUDPC02 ya existe en el AD (curf.net/Computers · deshabilitado)');
    expect(redis.set).not.toHaveBeenCalled();
  });

  test('CAM: reserva si es el próximo libre en HikCentral, sin consultar el AD', async () => {
    estadoCamaras.mockResolvedValue(estadoHik(31));

    const res = await lock({ hostname: 'CAMJRP331', tipo: 3 });

    expect(res.status).toBe(200);
    expect(equipoEnAD).not.toHaveBeenCalled();
    expect(redis.set).toHaveBeenCalled();
  });

  test('CAM: ya no es el próximo libre, rechaza y dice cuál es', async () => {
    estadoCamaras.mockResolvedValue(estadoHik(32));

    const res = await lock({ hostname: 'CAMJRP331', tipo: 3 });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CAMJRP331 ya no está libre: el próximo es CAMJRP332');
    expect(redis.set).not.toHaveBeenCalled();
  });

  test('CAM: hostname que no respeta el formato se rechaza', async () => {
    const res = await lock({ hostname: 'CAMPBJR01X', tipo: 3 });

    expect(res.status).toBe(400);
    expect(redis.set).not.toHaveBeenCalled();
  });

  test('CAM: NVR sin responder, no reserva', async () => {
    estadoCamaras.mockResolvedValue(estadoHik(31, ['NVR-JR-1']));

    const res = await lock({ hostname: 'CAMJRP331', tipo: 3 });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/No responde NVR-JR-1/);
    expect(redis.set).not.toHaveBeenCalled();
  });

  test('CAM: HikCentral caído, no reserva', async () => {
    estadoCamaras.mockRejectedValue(Object.assign(new Error('HikCentral no respondió (ETIMEDOUT)'), { status: 502 }));

    const res = await lock({ hostname: 'CAMJRP331', tipo: 3 });

    expect(res.status).toBe(502);
    expect(redis.set).not.toHaveBeenCalled();
  });

  test('sin tipo: valida contra el AD igual', async () => {
    await lock({ hostname: 'JRPBAUDPC05' });

    expect(equipoEnAD).toHaveBeenCalledWith('JRPBAUDPC05');
  });

  test('DC caído: reserva igual, con aviso', async () => {
    equipoEnAD.mockRejectedValue(new Error('connect ETIMEDOUT'));

    const res = await lock({ hostname: 'JRPBAUDPC05', tipo: 1 });

    expect(res.status).toBe(200);
    expect(res.body.aviso_ad).toMatch(/No se pudo verificar en el AD/);
    expect(redis.set).toHaveBeenCalled();
  });

  test('AD sin configurar: reserva igual, avisando qué falta', async () => {
    const err = new Error('Falta configurar la cuenta de lectura del AD (LDAP_LECTURA_USUARIO / LDAP_LECTURA_PASSWORD)');
    err.status = 503;
    equipoEnAD.mockRejectedValue(err);

    const res = await lock({ hostname: 'JRPBAUDPC05', tipo: 1 });

    expect(res.status).toBe(200);
    expect(res.body.aviso_ad).toBe(`No se verificó en el AD: ${err.message}`);
  });

  test('ya existe en la base: rechaza sin consultar el AD', async () => {
    hostnamesEnBase = ['JRPBAUDPC01'];

    const res = await lock({ hostname: 'JRPBAUDPC01', tipo: 1 });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/base de datos/);
    expect(equipoEnAD).not.toHaveBeenCalled();
  });

  test('más de 15 caracteres: rechaza (límite de Windows)', async () => {
    const res = await lock({ hostname: 'JRP1ADMINISPC0001', tipo: 1 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/hasta 15/);
    expect(equipoEnAD).not.toHaveBeenCalled();
  });

  test('reservado por otro usuario: informa quién y cuánto falta', async () => {
    redis.set.mockResolvedValue(null);
    redis.get.mockResolvedValue(JSON.stringify({ nombre: 'Otro Técnico', userId: 2 }));
    redis.ttl.mockResolvedValue(120);

    const res = await lock({ hostname: 'JRPBAUDPC05', tipo: 1 });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ locked_by: 'Otro Técnico', expires_in: 120 });
  });
});

// ═══════════════════════════════════════════════════════════
describe('POST / — registrar cámara', () => {
  const cam = { hostname: 'CAMJRP331', tipo: 3, edificio: 1, floor_id: 5, sequential_number: 31 };

  test('reserva en HikCentral con edificio, piso y técnico, y después guarda', async () => {
    const res = await guardar(cam);

    expect(res.status).toBe(201);
    expect(reservarCamara).toHaveBeenCalledWith({
      edificio: 'JR', piso: 'P3', hostname: 'CAMJRP331', creadoPor: 'Técnico Test',
    });
    expect(anularCamara).not.toHaveBeenCalled();
  });

  test('HikCentral ya tomó el número: no guarda nada', async () => {
    reservarCamara.mockRejectedValue(Object.assign(
      new Error('CAMJRP331 ya no esta libre: el proximo es CAMJRP332'), { status: 409 }));

    const res = await guardar(cam);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/el proximo es CAMJRP332/);
    expect(db.query).not.toHaveBeenCalledWith(expect.stringMatching(/INSERT INTO nomenclatures/), expect.anything());
  });

  test('si falla el alta acá, anula la reserva en HikCentral', async () => {
    hostnamesEnBase = ['CAMJRP331'];

    const res = await guardar(cam);

    expect(res.status).toBe(409);
    expect(anularCamara).toHaveBeenCalledWith('CAMJRP331');
  });

  test('una PC no pasa por HikCentral', async () => {
    const res = await guardar({ hostname: 'JRPBAUDPC05', tipo: 1, edificio: 1, floor_id: 1, sector: 5, sequential_number: 5 });

    expect(res.status).toBe(201);
    expect(reservarCamara).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════
describe('Tipos deshabilitados (FID)', () => {
  test('no aparece en el catálogo', async () => {
    const res = await request(app).get('/api/nomenclatures/catalogs/device-types');

    expect(res.status).toBe(200);
    expect(res.body.map(t => t.code)).toEqual(['PC', 'CAM', 'TT']);
  });

  test('/next lo rechaza', async () => {
    const res = await next({ tipo: 6, edificio: 1 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/deshabilitado/);
  });

  test('/lock lo rechaza sin reservar', async () => {
    const res = await lock({ hostname: 'FIDPBJR01', tipo: 6 });

    expect(res.status).toBe(400);
    expect(redis.set).not.toHaveBeenCalled();
  });

  test('el alta lo rechaza sin guardar', async () => {
    const res = await guardar({ hostname: 'FIDPBJR01', tipo: 6, edificio: 1, floor_id: 1, sequential_number: 1 });

    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalledWith(expect.stringMatching(/INSERT INTO nomenclatures/), expect.anything());
  });
});
