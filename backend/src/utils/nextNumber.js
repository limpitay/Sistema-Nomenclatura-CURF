// Dado un conjunto de números secuenciales ya usados, devuelve el primer
// hueco disponible empezando en 1 (no el máximo + 1) — así se reciclan los
// números libres en el medio de la secuencia.
function nextAvailableNumber(usedNumbers) {
  const used = new Set(usedNumbers);
  let next = 1;
  while (used.has(next)) next++;
  return next;
}

module.exports = { nextAvailableNumber };
