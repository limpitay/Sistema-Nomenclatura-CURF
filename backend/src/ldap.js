// Login contra Active Directory (AUTH_MODE=ldap).
// Solo valida la contraseña con un bind usuario@dominio: quién puede entrar y
// con qué rol lo sigue decidiendo la tabla users (alta desde /admin).
const { Client } = require('ldapts');

const AUTH_MODE = (process.env.AUTH_MODE || 'local').toLowerCase(); // 'local' | 'ldap'

const ldap = {
  url:         process.env.LDAP_URL || '',
  dominio:     process.env.LDAP_DOMINIO || '',
  tlsInsecure: process.env.LDAP_TLS_INSECURE === 'true',
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

/**
 * Valida usuario/contraseña contra el AD.
 * Devuelve true/false según las credenciales. Si el DC no responde, lanza
 * (para distinguir "contraseña mala" de "no hay controlador de dominio").
 */
async function validarCredencialesAD(sam, password) {
  const client = new Client({
    url: ldap.url,
    timeout: 8000,
    connectTimeout: 8000,
    // Para certificado interno/autofirmado del DC: LDAP_TLS_INSECURE=true
    ...(/^ldaps:/i.test(ldap.url) && { tlsOptions: { rejectUnauthorized: !ldap.tlsInsecure } }),
  });
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

module.exports = { AUTH_MODE, ldap, validarConfig, validarCredencialesAD };
