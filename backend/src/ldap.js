// Active Directory:
// - Login (AUTH_MODE=ldap): solo valida la contraseña con un bind usuario@dominio;
//   quién puede entrar y con qué rol lo sigue decidiendo la tabla users (alta desde /admin).
// - Consultas de solo lectura (sección "Equipos AD") con la cuenta LDAP_LECTURA_*.
const { Client } = require('ldapts');

const AUTH_MODE = (process.env.AUTH_MODE || 'local').toLowerCase(); // 'local' | 'ldap'

const ldap = {
  url:         process.env.LDAP_URL || '',
  dominio:     process.env.LDAP_DOMINIO || '',
  tlsInsecure: process.env.LDAP_TLS_INSECURE === 'true',
  // Cuenta de solo lectura para consultar el AD (alcanza un usuario común del dominio, ej. svc-nomenclatura)
  lecturaUsuario:  process.env.LDAP_LECTURA_USUARIO || '',
  lecturaPassword: process.env.LDAP_LECTURA_PASSWORD || '',
  // OU desde donde se listan los equipos (ej. OU=Equipos,OU=CURF,DC=curf,DC=net)
  equiposBase:     process.env.LDAP_EQUIPOS_BASE || '',
};

// Se valida al arrancar: mejor que la API no levante a que levante sin poder loguear a nadie.
function validarConfig() {
  if (!['local', 'ldap'].includes(AUTH_MODE)) {
    console.error(`[auth] AUTH_MODE="${AUTH_MODE}" no es válido (local | ldap)`);
    process.exit(1);
  }
  if (AUTH_MODE !== 'ldap') return;

  const faltan = [['LDAP_URL', ldap.url], ['LDAP_DOMINIO', ldap.dominio]].filter(([, v]) => !v).map(([k]) => k);
  if (faltan.length) {
    console.error(`[auth] AUTH_MODE=ldap pero falta ${faltan.join(' y ')} en el .env`);
    process.exit(1);
  }
  if (/^ldap:/i.test(ldap.url)) {
    console.warn('[auth] AVISO: LDAP_URL usa ldap:// (sin cifrar): las contraseñas viajan legibles hasta el DC. Preferí ldaps://');
  }
  console.log(`[auth] Login con credenciales de dominio (${ldap.dominio} vía ${ldap.url})`);
}

// Las consultas que hace el Builder usan un timeout más corto: si el DC no
// responde, mejor seguir sin verificar que dejar al técnico esperando.
function nuevoCliente(timeoutMs = 8000) {
  return new Client({
    url: ldap.url,
    timeout: timeoutMs,
    connectTimeout: timeoutMs,
    // Para certificado interno/autofirmado del DC: LDAP_TLS_INSECURE=true
    ...(/^ldaps:/i.test(ldap.url) && { tlsOptions: { rejectUnauthorized: !ldap.tlsInsecure } }),
  });
}

/**
 * Valida usuario/contraseña contra el AD.
 * Devuelve true/false según las credenciales. Si el DC no responde, lanza
 * (para distinguir "contraseña mala" de "no hay controlador de dominio").
 */
async function validarCredencialesAD(sam, password) {
  const client = nuevoCliente();
  try {
    await client.bind(`${sam}@${ldap.dominio}`, password);
    return true;
  } catch (e) {
    // 49 = invalidCredentials (incluye cuenta bloqueada/deshabilitada/vencida)
    if (e?.code === 49 || /InvalidCredentials/i.test(e?.name || '')) return false;
    throw e;
  } finally {
    await client.unbind().catch(() => {});
  }
}

// Error con status HTTP, para que la ruta devuelva un mensaje claro en vez de un 500
function errorConfig(msg) {
  const e = new Error(msg);
  e.status = 503;
  return e;
}

/** Cliente ya autenticado con la cuenta de lectura (LDAP_LECTURA_USUARIO / LDAP_LECTURA_PASSWORD) */
async function clienteLectura(timeoutMs) {
  const { url, dominio, lecturaUsuario: usuario, lecturaPassword: password } = ldap;
  if (!url || !dominio) throw errorConfig('Falta configurar LDAP_URL y LDAP_DOMINIO en el .env');
  if (!usuario || !password) throw errorConfig('Falta configurar la cuenta de lectura del AD (LDAP_LECTURA_USUARIO / LDAP_LECTURA_PASSWORD)');

  const client = nuevoCliente(timeoutMs);
  try {
    await client.bind(/[@\\]/.test(usuario) ? usuario : `${usuario}@${dominio}`, password);
  } catch (e) {
    await client.unbind().catch(() => {});
    throw e;
  }
  return client;
}

const UAC_DESHABILITADA = 0x2;

// ldapts devuelve [] cuando el atributo está vacío: sin este cuidado aparece el texto "undefined"
function texto(v) {
  const x = Array.isArray(v) ? v[0] : v;
  return x == null || x === '' ? null : String(x);
}
// FILETIME (100 ns desde 1601, como lastLogonTimestamp) -> ISO. 0 / vacío / "nunca" (2^63-1) -> null
function fechaFiletime(v) {
  const n = Number(texto(v));
  if (!n || n >= 9e18) return null;
  return new Date(n / 1e4 - 11644473600000).toISOString();
}
// GeneralizedTime ("20240131153000.0Z", como whenCreated) -> ISO
function fechaGeneralizada(v) {
  const m = String(texto(v) || '').match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null;
}

// "CN=JRPBAUDPC01,OU=Sub,OU=PC,OU=Equipos,OU=CURF,DC=curf,DC=net" con base "OU=Equipos,..."
// -> "PC/Sub" (la carpeta como se ve en la consola del AD, relativa a la base). Vacío = en la base misma.
function carpetaRelativa(dn, base) {
  const partes = String(dn).split(/,(?=(?:CN|OU|DC)=)/i);
  const nBase = base.split(/,(?=(?:CN|OU|DC)=)/i).length;
  return partes.slice(1, partes.length - nBase)
    .map((p) => p.replace(/^(?:OU|CN)=/i, '').replace(/\\,/g, ','))
    .reverse()
    .join('/');
}

/** Cuentas de equipo debajo de LDAP_EQUIPOS_BASE (sección de solo lectura "Equipos AD") */
async function equiposDelAD() {
  if (!ldap.equiposBase) throw errorConfig('Falta configurar LDAP_EQUIPOS_BASE en el .env (ej. OU=Equipos,OU=CURF,DC=curf,DC=net)');

  const client = await clienteLectura();
  try {
    const { searchEntries } = await client.search(ldap.equiposBase, {
      scope: 'sub', filter: '(objectCategory=computer)', paged: { pageSize: 500 },
      attributes: ['cn', 'operatingSystem', 'description', 'userAccountControl', 'lastLogonTimestamp', 'whenCreated'],
    });
    return searchEntries.map((c) => ({
      nombre:       texto(c.cn),
      carpeta:      carpetaRelativa(c.dn, ldap.equiposBase),
      so:           texto(c.operatingSystem),
      descripcion:  texto(c.description),
      habilitado:   !(Number(texto(c.userAccountControl)) & UAC_DESHABILITADA),
      ultimo_login: fechaFiletime(c.lastLogonTimestamp),
      creado:       fechaGeneralizada(c.whenCreated),
    }));
  } finally {
    await client.unbind().catch(() => {});
  }
}

/**
 * OUs debajo de LDAP_EQUIPOS_BASE como carpetas relativas, ej. "Jacinto Rios/Auditoria Medica"
 * (sección "Áreas AD": así aparecen también las áreas que todavía no tienen equipos).
 */
async function ousDelAD() {
  if (!ldap.equiposBase) throw errorConfig('Falta configurar LDAP_EQUIPOS_BASE en el .env (ej. OU=Equipos,OU=CURF,DC=curf,DC=net)');

  const client = await clienteLectura();
  try {
    const { searchEntries } = await client.search(ldap.equiposBase, {
      scope: 'sub', filter: '(objectClass=organizationalUnit)', paged: { pageSize: 500 },
      attributes: ['ou'],
    });
    // carpetaRelativa descarta el primer componente (el CN del equipo): acá se le antepone uno ficticio
    return searchEntries.map((o) => carpetaRelativa(`CN=_,${o.dn}`, ldap.equiposBase)).filter(Boolean);
  } finally {
    await client.unbind().catch(() => {});
  }
}

// ── Validación de hostnames contra el AD (Builder) ─────────────────────────
// Se busca en TODO el dominio, no solo en LDAP_EQUIPOS_BASE: un equipo recién
// unido cae en curf.net/Computers y su nombre ya está ocupado igual.
const TIMEOUT_BUILDER = 3000;

// "curf.net" -> "DC=curf,DC=net"
const baseDominio = () => ldap.dominio.split('.').map((p) => `DC=${p}`).join(',');

function escapeFilter(v) {
  return String(v).replace(/[\\*()\0]/g, (c) => '\\' + c.charCodeAt(0).toString(16).padStart(2, '0'));
}

// "CN=X,OU=PC,OU=Equipos,OU=CURF,DC=curf,DC=net" -> "curf.net/CURF/Equipos/PC" (como "Carpeta" en la consola del AD)
function rutaAD(dn) {
  const partes = String(dn).split(/,(?=(?:CN|OU|DC)=)/i).map((p) => p.split('=')).map(([k, ...v]) => [k.toUpperCase(), v.join('=')]);
  const dominio = partes.filter(([k]) => k === 'DC').map(([, v]) => v).join('.');
  const ruta = partes.slice(1).filter(([k]) => k !== 'DC').map(([, v]) => v.replace(/\\,/g, ',')).reverse();
  return [dominio, ...ruta].join('/');
}

/** Busca un equipo por nombre exacto. Devuelve null si no existe. */
async function equipoEnAD(nombre) {
  const client = await clienteLectura(TIMEOUT_BUILDER);
  try {
    const n = escapeFilter(nombre);
    const { searchEntries } = await client.search(baseDominio(), {
      scope: 'sub', sizeLimit: 1,
      filter: `(&(objectCategory=computer)(|(cn=${n})(sAMAccountName=${n}$)))`,
      attributes: ['cn', 'userAccountControl', 'lastLogonTimestamp'],
    });
    const c = searchEntries[0];
    if (!c) return null;
    return {
      nombre:       texto(c.cn),
      ubicacion:    rutaAD(c.dn),
      habilitado:   !(Number(texto(c.userAccountControl)) & UAC_DESHABILITADA),
      ultimo_login: fechaFiletime(c.lastLogonTimestamp),
    };
  } finally {
    await client.unbind().catch(() => {});
  }
}

/**
 * Nombres de equipos del dominio que matchean un patrón con comodines,
 * ej. ['JR', 'ADMPC'] -> (cn=JR*ADMPC*). Para calcular qué números ya están usados.
 */
async function nombresEquiposAD(partes) {
  const client = await clienteLectura(TIMEOUT_BUILDER);
  try {
    const patron = partes.map(escapeFilter).join('*') + '*';
    const { searchEntries } = await client.search(baseDominio(), {
      scope: 'sub', filter: `(&(objectCategory=computer)(cn=${patron}))`,
      attributes: ['cn'], paged: { pageSize: 500 },
    });
    return searchEntries.map((c) => texto(c.cn)).filter(Boolean);
  } finally {
    await client.unbind().catch(() => {});
  }
}

module.exports = {
  AUTH_MODE, ldap, validarConfig, validarCredencialesAD, equiposDelAD, ousDelAD, carpetaRelativa,
  equipoEnAD, nombresEquiposAD, rutaAD,
};
