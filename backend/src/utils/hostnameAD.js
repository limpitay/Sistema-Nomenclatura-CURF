// Qué hostnames se validan contra el AD y cómo encontrar los números ya usados
// allá. CAM y FID no se unen al dominio, así que no se validan.
const TIPOS_EN_AD = ['PC', 'NB', 'TT', 'LL'];

// Tipos cuyo hostname es Tipo-Piso-Edificio-Número (correlativo global por tipo)
const TIPOS_GLOBALES_EN_AD = ['TT', 'LL'];

const escRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const alternativas = (codes) => `(?:${codes.map(escRegex).join('|')})`;

/**
 * Patrón para buscar en el AD los equipos que comparten contador con el que se
 * está generando. El piso va como comodín porque el número no depende del piso
 * (PC/NB: edificio+sector+tipo; TT/LL: global por tipo).
 * Devuelve null si el tipo no se valida contra el AD o faltan datos.
 *   partes: para el filtro LDAP (cn=partes[0]*partes[1]*...)
 *   regex:  para quedarse solo con los que respetan el formato y extraer el número
 */
function patronAD({ tipo, edificio, sector, pisos, edificios }) {
  if (!TIPOS_EN_AD.includes(tipo) || !pisos?.length) return null;

  if (TIPOS_GLOBALES_EN_AD.includes(tipo)) {
    if (!edificios?.length) return null;
    return {
      partes: [tipo],
      regex: new RegExp(`^${escRegex(tipo)}${alternativas(pisos)}${alternativas(edificios)}(\\d+)$`, 'i'),
    };
  }

  if (!edificio || !sector) return null;
  return {
    partes: [edificio, `${sector}${tipo}`],
    regex: new RegExp(`^${escRegex(edificio)}${alternativas(pisos)}${escRegex(sector)}${escRegex(tipo)}(\\d+)$`, 'i'),
  };
}

/** Números usados según los nombres del AD que cumplen el patrón */
function numerosDesdeNombres(nombres, regex) {
  return nombres
    .map((n) => String(n).match(regex))
    .filter(Boolean)
    .map((m) => parseInt(m[1], 10));
}

module.exports = { TIPOS_EN_AD, TIPOS_GLOBALES_EN_AD, patronAD, numerosDesdeNombres };
