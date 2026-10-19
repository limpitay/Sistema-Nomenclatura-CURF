// Panel HikCentral CURF (Sistema-API-HIKCENTRAL): es el que decide el número de
// los hostnames CAM, porque ve las cámaras cargadas en los NVR y guarda las
// reservas. Acá solo se le pregunta el próximo libre y se le pide que reserve.
// Entra con HIKCENTRAL_TOKEN (= NOMENCLATURA_TOKEN del .env de HikCentral).

const hik = {
  url:   (process.env.HIKCENTRAL_URL || '').replace(/\/+$/, ''),
  token: process.env.HIKCENTRAL_TOKEN || '',
};

// Hostname CAM: CAM + edificio (2) + piso (2) + número, ej. CAMJRP331
const CAM_RE = /^CAM([A-Z]{2})([A-Z0-9]{2})(\d+)$/i;

function parseCam(hostname) {
  const m = CAM_RE.exec(hostname || '');
  return m ? { edificio: m[1].toUpperCase(), piso: m[2].toUpperCase(), numero: parseInt(m[3], 10) } : null;
}

// Error con .status: el de HikCentral si respondió (400/409), 503 si falta
// configurar y 502 si no se pudo llegar.
function errorHik(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// La reserva tarda más: HikCentral vuelve a leer todos los NVR antes de reservar.
async function pedir(method, path, body, timeoutMs = 15000) {
  if (!hik.url || !hik.token)
    throw errorHik('Falta configurar el panel de Cámaras (HIKCENTRAL_URL / HIKCENTRAL_TOKEN)', 503);

  let res;
  try {
    res = await fetch(`${hik.url}${path}`, {
      method,
      headers: { 'X-Service-Token': hik.token, ...(body && { 'Content-Type': 'application/json' }) },
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    // ECONNREFUSED / ETIMEDOUT vienen en err.cause (a veces dentro de un AggregateError)
    const motivo = err.cause?.code || err.cause?.errors?.[0]?.code || (err.name === 'TimeoutError' ? 'timeout' : err.message);
    throw errorHik(`El panel de Cámaras no respondió (${motivo})`, 502);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw errorHik(data.error || `El panel de Cámaras respondió ${res.status}`, res.status >= 500 ? 502 : res.status);
  return data;
}

/** { buildings: [{ code, name, nextNumber }], floors, reservations, unreachableNvrs } */
function estadoCamaras() {
  return pedir('GET', '/api/cameras/hostname-generator');
}

/** Reserva justo ese hostname; si ya no es el próximo libre, HikCentral responde 409 */
function reservarCamara({ edificio, piso, hostname, creadoPor }) {
  return pedir('POST', '/api/cameras/hostname-generator',
    { building: edificio, floor: piso, hostname, createdBy: creadoPor }, 120000);
}

function anularCamara(hostname) {
  return pedir('DELETE', `/api/cameras/hostname-generator/${encodeURIComponent(hostname)}`);
}

module.exports = { parseCam, estadoCamaras, reservarCamara, anularCamara };
