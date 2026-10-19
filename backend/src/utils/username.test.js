const { normalizarUsuario } = require('./username');

describe('normalizarUsuario', () => {
  test('deja el usuario simple en minúsculas', () => {
    expect(normalizarUsuario('DVega')).toBe('dvega');
  });

  test('saca el prefijo DOMINIO\\', () => {
    expect(normalizarUsuario('CURF\\dvega')).toBe('dvega');
  });

  test('saca el sufijo @dominio (UPN)', () => {
    expect(normalizarUsuario('dvega@curf.net')).toBe('dvega');
  });

  test('ignora espacios y valores vacíos', () => {
    expect(normalizarUsuario('  dvega  ')).toBe('dvega');
    expect(normalizarUsuario(undefined)).toBe('');
  });
});
