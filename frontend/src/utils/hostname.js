// Solo estos tipos de dispositivo requieren cargar Usuario Windows
export const TIPOS_CON_USUARIO = ['PC', 'TT', 'LL', 'NB'];

// Estos tipos arman el hostname como Tipo-Edificio-Piso-Número (sin Sector en el código,
// aunque el campo Sector se sigue pidiendo en el formulario para reportes internos)
export const TIPOS_SIN_SECTOR_EN_CODIGO = ['TT', 'LL', 'CAM', 'FID'];

// Cuando el Sector elegido es Consultorio, el "Número" no se autogenera:
// lo carga el técnico a mano (es el número físico del consultorio), y el
// hostname no lleva el código de Tipo (Edificio-Piso-Sector-Número)
export const SECTOR_CONSULTORIO = 'CON';

// Arma el hostname visual y el hostname AD final según tipo/sector/edificio/piso.
// Devuelve { hostname: '', display: '' } si todavía faltan campos requeridos.
export function buildHostname({ edifCode, tipoCode, pisoCode, sectorCode, nextNum }) {
  const sinSector = TIPOS_SIN_SECTOR_EN_CODIGO.includes(tipoCode);
  const esConsultorio = sectorCode === SECTOR_CONSULTORIO;
  const camposCompletos = sinSector
    ? edifCode && tipoCode && pisoCode && nextNum
    : edifCode && tipoCode && pisoCode && sectorCode && nextNum;

  if (!camposCompletos) return { hostname: '', display: '' };

  const num = String(nextNum).padStart(2, '0');

  if (esConsultorio) {
    // Sector Consultorio -> Edificio-Piso-Sector-Número (sin Tipo en el código)
    return {
      display: `${edifCode}-${pisoCode}-${sectorCode}-${num}`,
      hostname: `${edifCode}${pisoCode}${sectorCode}${num}`,
    };
  }
  if (sinSector) {
    // TT, LL, CAM, FID -> Tipo-Edificio-Piso-Número (sin Sector en el código)
    return {
      display: `${tipoCode}-${edifCode}-${pisoCode}${num}`,
      hostname: `${tipoCode}${edifCode}${pisoCode}${num}`,
    };
  }
  // PC, NB (y el resto por defecto) -> Edificio-Piso-Sector-Tipo-Número
  return {
    display: `${edifCode}-${pisoCode}-${sectorCode}-${tipoCode}${num}`,
    hostname: `${edifCode}${pisoCode}${sectorCode}${tipoCode}${num}`,
  };
}
