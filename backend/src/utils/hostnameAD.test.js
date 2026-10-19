const { patronAD, numerosDesdeNombres } = require('./hostnameAD');

const PISOS_JR = ['SS', 'PB', 'P1', 'P2'];

describe('patronAD', () => {
  test('CAM y FID no se validan contra el AD', () => {
    expect(patronAD({ tipo: 'CAM', edificio: 'JR', sector: 'ADM', pisos: PISOS_JR })).toBeNull();
    expect(patronAD({ tipo: 'FID', pisos: PISOS_JR, edificios: ['JR'] })).toBeNull();
  });

  test('PC: edificio + cualquier piso + sector + tipo', () => {
    const p = patronAD({ tipo: 'PC', edificio: 'JR', sector: 'ADM', pisos: PISOS_JR });
    expect(p.partes).toEqual(['JR', 'ADMPC']);
    const nombres = ['JRP1ADMPC03', 'JRPBADMPC01', 'jrp2admpc12', 'JRP1ADMNB05', 'JRP1ADMPC03-OLD', 'ONP1ADMPC07'];
    expect(numerosDesdeNombres(nombres, p.regex)).toEqual([3, 1, 12]);
  });

  test('TT: global por tipo, cualquier piso y edificio', () => {
    const p = patronAD({ tipo: 'TT', pisos: ['PB', 'P1'], edificios: ['JR', 'ON'] });
    expect(p.partes).toEqual(['TT']);
    expect(numerosDesdeNombres(['TTPBJR01', 'TTP1ON02', 'TTP1XX03', 'TTPBJR'], p.regex)).toEqual([1, 2]);
  });

  test('sin sector (PC/NB) o sin pisos no hay patrón', () => {
    expect(patronAD({ tipo: 'PC', edificio: 'JR', pisos: PISOS_JR })).toBeNull();
    expect(patronAD({ tipo: 'PC', edificio: 'JR', sector: 'ADM', pisos: [] })).toBeNull();
  });
});
