// Learner-chosen levels. Nothing is ever locked: any profile can switch to any level at any time.
// A level changes the register of the content (words, equations, depth of maths), not access.

export const LEVELS = Object.freeze([
  { id: 1, key: 'cadet', name: 'Cadet', stage: 'Year 7-8', blurb: 'Plain words and small steps. A great place to start.' },
  { id: 2, key: 'pilot', name: 'Pilot', stage: 'Year 9-10', blurb: 'Real equations and units, still friendly.' },
  { id: 3, key: 'commander', name: 'Commander', stage: 'GCSE', blurb: 'Rearranging, standard form and bigger puzzles.' },
  { id: 4, key: 'specialist', name: 'Specialist', stage: 'A-level', blurb: 'Circuit laws and proper working-out.' },
  { id: 5, key: 'chief-engineer', name: 'Chief Engineer', stage: 'University', blurb: 'Node voltages and the full maths.' },
]);

export const DEFAULT_LEVEL = 1;
export const LEVEL_IDS = LEVELS.map((l) => l.id);

export function isValidLevel(level) {
  return Number.isInteger(level) && LEVEL_IDS.includes(level);
}

export function levelInfo(level) {
  return LEVELS.find((l) => l.id === level) ?? LEVELS[0];
}

/**
 * Choose the content variant for a level. `variants` is keyed by level id, e.g. { 1: ..., 2: ..., 3: ... }.
 * Exact match wins. Otherwise use the nearest LOWER level (so a Chief Engineer sees Commander
 * content rather than nothing), and only look upward if nothing lower exists.
 * `exact: false` lets the UI say honestly "this is the Commander version; yours is coming".
 * @returns {{ value: any, usedLevel: number, exact: boolean } | null}
 */
export function pickForLevel(variants, level) {
  const have = Object.keys(variants ?? {})
    .map(Number)
    .filter((n) => LEVEL_IDS.includes(n))
    .sort((a, b) => a - b);
  if (have.length === 0) return null;
  if (have.includes(level)) return { value: variants[level], usedLevel: level, exact: true };
  const lower = have.filter((n) => n < level);
  const usedLevel = lower.length ? lower[lower.length - 1] : have[0];
  return { value: variants[usedLevel], usedLevel, exact: false };
}
