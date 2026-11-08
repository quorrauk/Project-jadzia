// Adaptive level. Watches how answers go and SUGGESTS (or, in auto mode, makes) a one-level move.
// Always reversible: the learner can pick any level at any time, and that choice wins.
//
// Outcomes:
//   'clean'     right first time, no hint, no reveal
//   'ok'        right, but with a wrong try or a hint
//   'struggle'  needed the answer shown, or failed twice

export const UP_AFTER = 3;
export const DOWN_AFTER = 2;
export const MIN_LEVEL = 1;
export const MAX_LEVEL = 5;

export function createTracker(level) {
  let current = level;
  let clean = 0;
  let struggles = 0;
  return {
    get level() { return current; },
    get streaks() { return { clean, struggles }; },
    /** The learner chose a level themselves. Start counting fresh from there. */
    setLevel(l) {
      current = l;
      clean = 0;
      struggles = 0;
    },
    /** @returns {null | { from: number, to: number, direction: 'up' | 'down' }} */
    record(outcome) {
      if (outcome === 'clean') {
        clean += 1;
        struggles = 0;
      } else if (outcome === 'struggle') {
        struggles += 1;
        clean = 0;
      } else {
        clean = 0;
      }
      if (clean >= UP_AFTER && current < MAX_LEVEL) return move(1);
      if (struggles >= DOWN_AFTER && current > MIN_LEVEL) return move(-1);
      return null;
    },
  };

  function move(step) {
    const from = current;
    current += step;
    clean = 0;
    struggles = 0;
    return { from, to: current, direction: step > 0 ? 'up' : 'down' };
  }
}

/** Classify a finished question. */
export function outcomeFor({ wrongTries, hints, revealed }) {
  if (revealed || wrongTries >= 2) return 'struggle';
  if (wrongTries === 0 && hints === 0) return 'clean';
  return 'ok';
}
