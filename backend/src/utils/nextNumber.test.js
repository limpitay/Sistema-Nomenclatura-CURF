const { nextAvailableNumber } = require('./nextNumber');

describe('nextAvailableNumber', () => {
  test('devuelve 1 cuando no hay números usados', () => {
    expect(nextAvailableNumber([])).toBe(1);
  });

  test('devuelve el siguiente al máximo cuando la secuencia es continua', () => {
    expect(nextAvailableNumber([1, 2, 3])).toBe(4);
  });

  test('rellena huecos antes de extender la secuencia', () => {
    expect(nextAvailableNumber([1, 2, 4, 5])).toBe(3);
  });

  test('ignora el orden y los duplicados de la entrada', () => {
    expect(nextAvailableNumber([5, 1, 1, 3])).toBe(2);
  });
});
