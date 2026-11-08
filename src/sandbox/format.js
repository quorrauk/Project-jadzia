// Number formatting for readouts. Three significant figures, SI prefixes.

const sig = (x) => String(Number(x.toPrecision(3)));
const sign = (n) => (n < 0 ? '-' : '');

function scaled(n, unit, steps) {
  if (!Number.isFinite(n)) return `? ${unit}`;
  const x = Math.abs(n);
  if (x === 0) return `0 ${unit}`;
  for (const [min, factor, prefix] of steps) {
    if (x >= min) return `${sign(n)}${sig(x * factor)} ${prefix}${unit}`;
  }
  const [, factor, prefix] = steps[steps.length - 1];
  return `${sign(n)}${sig(x * factor)} ${prefix}${unit}`;
}

export const formatCurrent = (a) => scaled(a, 'A', [[1, 1, ''], [1e-3, 1e3, 'm'], [0, 1e6, 'µ']]);
export const formatVoltage = (v) => scaled(v, 'V', [[1, 1, ''], [1e-3, 1e3, 'm'], [0, 1e6, 'µ']]);
export const formatPower = (w) => scaled(w, 'W', [[1, 1, ''], [1e-3, 1e3, 'm'], [0, 1e6, 'µ']]);
export const formatResistance = (r) => scaled(r, 'Ω', [[1e6, 1e-6, 'M'], [1e3, 1e-3, 'k'], [0, 1, '']]);

const SUPERSCRIPT = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻' };

/** 0.225 -> "2.25 × 10⁻¹" */
export function standardForm(n) {
  if (!Number.isFinite(n)) return '?';
  if (n === 0) return '0';
  const x = Math.abs(n);
  let exp = Math.floor(Math.log10(x));
  let mantissa = Number((x / 10 ** exp).toPrecision(3));
  if (mantissa >= 10) {
    mantissa /= 10;
    exp += 1;
  }
  const power = String(exp).split('').map((c) => SUPERSCRIPT[c]).join('');
  return `${sign(n)}${mantissa} × 10${power}`;
}
