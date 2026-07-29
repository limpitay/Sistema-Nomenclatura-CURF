import { describe, test, expect } from 'vitest';
import { buildHostname } from './hostname';

describe('buildHostname', () => {
  test('devuelve vacío si faltan campos requeridos', () => {
    expect(buildHostname({ edifCode: 'JR', tipoCode: 'PC', pisoCode: '', sectorCode: 'ADM', nextNum: '1', esConsultorio: false }))
      .toEqual({ hostname: '', display: '' });
  });

  test('arma Edificio-Piso-Sector-Tipo-Num para computadoras (PC/NB)', () => {
    expect(buildHostname({ edifCode: 'JR', tipoCode: 'PC', pisoCode: 'P1', sectorCode: 'ADM', nextNum: '4', esConsultorio: false }))
      .toEqual({ display: 'JR-P1-ADM-PC-04', hostname: 'JRP1ADMPC04' });
  });

  test('arma Tipo-Piso-Edificio-Num para especiales (TT/LL/CAM/FID)', () => {
    expect(buildHostname({ edifCode: 'JR', tipoCode: 'TT', pisoCode: 'PB', sectorCode: '', nextNum: '2', esConsultorio: false }))
      .toEqual({ display: 'TT-PB-JR-02', hostname: 'TTPBJR02' });
  });

  test('arma Edificio-Piso-Sector-Num (sin Tipo) cuando el sector es Consultorio', () => {
    expect(buildHostname({ edifCode: 'JR', tipoCode: 'PC', pisoCode: 'P2', sectorCode: 'CON', nextNum: '5', esConsultorio: true }))
      .toEqual({ display: 'JR-P2-CON-05', hostname: 'JRP2CON05' });
  });

  test('en consultorio no exige tipoCode/sectorCode, solo edificio+piso+numero', () => {
    expect(buildHostname({ edifCode: 'JR', tipoCode: '', pisoCode: 'P2', sectorCode: 'CON', nextNum: '5', esConsultorio: true }))
      .toEqual({ display: 'JR-P2-CON-05', hostname: 'JRP2CON05' });
  });
});
