// Normaliza lo que el usuario escribe en el login o lo que el admin carga en
// /admin a un sAMAccountName en minúsculas, para que "CURF\DVega",
// "dvega@curf.net" y "dvega" sean el mismo usuario.
function normalizarUsuario(valor) {
  let u = String(valor || '').trim();
  if (u.includes('\\')) u = u.split('\\').pop();
  if (u.includes('@')) u = u.split('@')[0];
  return u.toLowerCase();
}

module.exports = { normalizarUsuario };
