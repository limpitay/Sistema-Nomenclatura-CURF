// Solo estos tipos de dispositivo requieren cargar Usuario Windows
export const TIPOS_CON_USUARIO = ['PC', 'NB'];

// Estos tipos arman el hostname especial como Tipo-Piso-Edificio-Número (sin Sector)
export const TIPOS_SIN_SECTOR_EN_CODIGO = ['TT', 'LL', 'CAM', 'FID'];

// Clave del sector consultorios configurada en la Base de Datos
export const SECTOR_CONSULTORIO = 'CON';

// Arma el hostname visual y el hostname AD final según tipo/sector/edificio/piso.
// esConsultorio se recibe calculado (sectorCode === SECTOR_CONSULTORIO) porque
// Builder.jsx ya lo necesita como flag propio para el resto del formulario.
// Devuelve { hostname: '', display: '' } si todavía faltan campos requeridos.
export function buildHostname({ edifCode, tipoCode, pisoCode, sectorCode, nextNum, esConsultorio }) {
  const sinSector = TIPOS_SIN_SECTOR_EN_CODIGO.includes(tipoCode);
  const camposCompletos = esConsultorio
    ? edifCode && pisoCode && nextNum
    : sinSector
      ? edifCode && tipoCode && pisoCode && nextNum
      : edifCode && tipoCode && pisoCode && sectorCode && nextNum;

  if (!camposCompletos) return { hostname: '', display: '' };

  const num = String(nextNum).padStart(2, '0');

  if (esConsultorio) {
    // Excepción Consultorios -> Edificio-Piso-Sector-Número (sin Tipo de hardware)
    return {
      display: `${edifCode}-${pisoCode}-${sectorCode}-${num}`,
      hostname: `${edifCode}${pisoCode}${sectorCode}${num}`,
    };
  }
  if (sinSector) {
    // Especiales (TT, LL, CAM, FID) -> Tipo-Piso-Edificio-Número
    return {
      display: `${tipoCode}-${pisoCode}-${edifCode}-${num}`,
      hostname: `${tipoCode}${pisoCode}${edifCode}${num}`,
    };
  }
  // Computadoras estándar (PC, NB) -> Edificio-Piso-Sector-Tipo-Número
  return {
    display: `${edifCode}-${pisoCode}-${sectorCode}-${tipoCode}-${num}`,
    hostname: `${edifCode}${pisoCode}${sectorCode}${tipoCode}${num}`,
  };
}
