const { carpetaRelativa, rutaAD } = require('./ldap');

describe('rutaAD', () => {
  test('arma la carpeta como en la consola del AD', () => {
    expect(rutaAD('CN=JRPBAUDPC01,OU=PC,OU=Equipos,OU=CURF,DC=curf,DC=net')).toBe('curf.net/CURF/Equipos/PC');
  });

  test('equipo recién unido en el contenedor Computers', () => {
    expect(rutaAD('CN=JRPBAUDPC01,CN=Computers,DC=curf,DC=net')).toBe('curf.net/Computers');
  });
});

const BASE = 'OU=Equipos,OU=CURF,DC=curf,DC=net';

describe('carpetaRelativa', () => {
  test('equipo en una subcarpeta directa', () => {
    expect(carpetaRelativa(`CN=JRPBAUDPC01,OU=PC,${BASE}`, BASE)).toBe('PC');
  });

  test('subcarpetas anidadas, de afuera hacia adentro', () => {
    expect(carpetaRelativa(`CN=X,OU=Sub,OU=Catamarca,${BASE}`, BASE)).toBe('Catamarca/Sub');
  });

  test('equipo directamente en la base', () => {
    expect(carpetaRelativa(`CN=X,${BASE}`, BASE)).toBe('');
  });

  test('respeta comas escapadas en el nombre de la OU', () => {
    expect(carpetaRelativa(`CN=X,OU=Jockey\\, Anexo,${BASE}`, BASE)).toBe('Jockey, Anexo');
  });
});
