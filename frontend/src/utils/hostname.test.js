import { describe, test, expect } from 'vitest';
import { buildHostname } from './hostname';

describe('buildHostname', () => {
  test('devuelve vacío si faltan campos requeridos', () => {
    expect(buildHostname({ edifCode: 'JR', tipoCode: 'PC', pisoCode: '', sectorCode: 'ADM', nextNum: '1' }))
      .toEqual({ hostname: '', display: '' });
  });

  test('arma Edificio-Piso-Sector-Tipo+Num para tipos estándar (PC/NB)', () => {
    expect(buildHostname({ edifCode: 'JR', tipoCode: 'PC', pisoCode: 'P1', sectorCode: 'ADM', nextNum: '4' }))
      .toEqual({ display: 'JR-P1-ADM-PC04', hostname: 'JRP1ADMPC04' });
  });

  test('arma Tipo-Edificio-Piso+Num para TT/LL/CAM/FID (sin sector en el código)', () => {
    expect(buildHostname({ edifCode: 'JR', tipoCode: 'TT', pisoCode: 'PB', sectorCode: '', nextNum: '2' }))
      .toEqual({ display: 'TT-JR-PB02', hostname: 'TTJRPB02' });
  });

  test('arma Edificio-Piso-Sector-Num (sin Tipo) cuando el sector es Consultorio', () => {
    expect(buildHostname({ edifCode: 'JR', tipoCode: 'PC', pisoCode: 'P2', sectorCode: 'CON', nextNum: '5' }))
      .toEqual({ display: 'JR-P2-CON-05', hostname: 'JRP2CON05' });
  });
});
