// Lesson engine: pure logic, no DOM. The UI (src/ui/lessons.js) draws what this decides.
//
// Content is JSON. Any text can be a plain string or a variants object keyed by level ({"1": "...", "2": "..."}).
// The nearest lower level is used when the learner's exact level was not written (see pickForLevel).

import { pickForLevel, LEVEL_IDS } from '../progress/levels.js';
import { evaluate } from '../sandbox/model.js';

export const STAGE_TYPES = ['briefing', 'learn', 'equation', 'example', 'try', 'mission', 'debrief', 'python', 'maths'];
export const TIERS = ['training', 'standard', 'stretch'];
export const MAX_RUNG = 4;

const isVariants = (v) =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0 && Object.keys(v).every((k) => LEVEL_IDS.includes(Number(k)));

/**
 * Replace every variants object in `node` with the version for `level`.
 * @returns {{ value: any, fellBack: number[] }} fellBack = levels actually used when the exact one was missing.
 */
export function resolveDeep(node, level) {
  const fellBack = [];
  const walk = (n) => {
    if (isVariants(n)) {
      const picked = pickForLevel(n, level);
      if (!picked.exact) fellBack.push(picked.usedLevel);
      return walk(picked.value);
    }
    if (Array.isArray(n)) return n.map(walk);
    if (n && typeof n === 'object') return Object.fromEntries(Object.entries(n).map(([k, v]) => [k, walk(v)]));
    return n;
  };
  const value = walk(node);
  return { value, fellBack };
}

/** A stage with text chosen for this level. `fellBack` is the list of levels used instead of the learner's own. */
export function resolveStage(stage, level) {
  const { value, fellBack } = resolveDeep(stage, level);
  return { ...value, fellBack };
}

// ---------------------------------------------------------------- glossary links

/** Split "A [[voltage]] is..." into [{text}, {term:'voltage'}, {text}]. */
export function linkTerms(text) {
  const out = [];
  const re = /\[\[([a-z0-9-]+)\]\]/g;
  let last = 0;
  let m;
  while ((m = re.exec(String(text)))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ term: m[1] });
    last = re.lastIndex;
  }
  if (last < String(text).length) out.push({ text: String(text).slice(last) });
  return out;
}

export function termsIn(text) {
  return linkTerms(text).filter((s) => s.term).map((s) => s.term);
}

// ---------------------------------------------------------------- the "I don't get it" ladder

const DEFAULT_LADDER = [
  'Let me say that again in simpler words. Take it one small bit at a time.',
  'Think of it like water in a pipe. Push is how hard the water is shoved. Flow is how much gets through.',
  'Here is the same idea with different numbers. Try the worked example stage, then come back.',
  'Watch me do it first. Then you do a smaller one.',
];

/**
 * Rung 1-4 of the help ladder for a stage. Always returns something, so nobody is ever stuck.
 * Stage content may supply `help: { "1": ..., "2": ..., "3": ..., "4": ... }` (each may itself have level variants).
 */
export function helpFor(stage, rung) {
  const r = Math.min(MAX_RUNG, Math.max(1, rung));
  const own = stage?.help?.[r] ?? stage?.help?.[String(r)];
  return { rung: r, text: own ?? DEFAULT_LADDER[r - 1], last: r === MAX_RUNG };
}

// ---------------------------------------------------------------- questions (Try one, Maths check)

const strip = (s) => String(s).trim().replace(/,/g, '').replace(/\s*(v|a|ma|ohms?|ω|w)\s*$/i, '');

/** Parse "0.5", "500", "5e-1", "2.5 x 10^-1" into a number, or NaN. */
export function parseNumber(input) {
  const t = strip(String(input).replace(/−/g, '-')).replace(/\s*[x×*]\s*10\s*\^?\s*(-?\d+)/i, 'e$1');
  if (t === '') return NaN;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Check an answer. No penalty: the caller just counts attempts. A wrong answer always gets an explanation.
 * question: { answer: number, tolerance?: relative (default 0.02), explain: string, wrong?: [{ value, why }] }
 */
export function checkAnswer(question, input) {
  const value = parseNumber(input);
  if (Number.isNaN(value)) return { correct: false, understood: false, text: 'I could not read that as a number. Try something like 0.5 or 500.' };
  const tol = question.tolerance ?? 0.02;
  const target = question.answer;
  const ok = target === 0 ? Math.abs(value) < 1e-9 : Math.abs(value - target) / Math.abs(target) <= tol;
  if (ok) return { correct: true, understood: true, text: question.explain };
  const known = (question.wrong ?? []).find((w) => Math.abs(value - w.value) <= Math.abs(w.value) * tol);
  return { correct: false, understood: true, text: known ? known.why : `Not quite. ${question.explain}` };
}

// ---------------------------------------------------------------- missions

function clone(board) {
  return JSON.parse(JSON.stringify(board));
}

/**
 * Has the board met the mission goal? goal examples:
 *   { type: 'lit', part: 'bulb', min: 1 }                 at least 1 bulb glowing
 *   { type: 'current', part: 'led', min: 0.005, max: 0.02 }  an LED carrying 5-20 mA, not burnt
 *   { type: 'no-burnt' }                                   nothing burnt
 * Several goals can be combined: { all: [goal, goal] }.
 */
export function checkGoal(goal, board) {
  if (goal.all) {
    const parts = goal.all.map((g) => checkGoal(g, board));
    return { met: parts.every((p) => p.met), notes: parts.filter((p) => !p.met).map((p) => p.note) };
  }
  const work = clone(board);
  const { result } = evaluate(work);
  const ofType = work.parts.filter((p) => (goal.part ? p.type === goal.part : true));
  const reading = (p) => result.components?.[p.id] ?? {};
  switch (goal.type) {
    case 'lit': {
      const n = ofType.filter((p) => !p.burnt && reading(p).lit).length;
      const met = n >= (goal.min ?? 1);
      return { met, notes: met ? [] : [`${n} lit so far`], note: `${n} lit so far` };
    }
    case 'current': {
      const ok = ofType.filter((p) => {
        const c = Math.abs(reading(p).current ?? 0);
        return !p.burnt && c >= (goal.min ?? 0) && c <= (goal.max ?? Infinity);
      });
      const met = ok.length >= (goal.count ?? 1);
      return { met, notes: met ? [] : ['current is not in range yet'], note: 'current is not in range yet' };
    }
    case 'no-burnt': {
      const met = !work.parts.some((p) => p.burnt);
      return { met, notes: met ? [] : ['something has burnt out'], note: 'something has burnt out' };
    }
    default:
      throw new Error(`Unknown goal type: ${goal.type}`);
  }
}

/**
 * Which tier to offer next? Offered, never forced.
 * Fails twice -> offer Training. Passes first time -> offer Stretch (if the mission has one).
 */
export function tierOffer({ tier, attempts, passed, hasStretch, hasTraining }) {
  if (!passed && attempts >= 2 && tier !== 'training' && hasTraining) return 'training';
  if (passed && attempts <= 1 && tier === 'standard' && hasStretch) return 'stretch';
  return null;
}

// ---------------------------------------------------------------- progress

/** completed is a list of strings: "ignition" (any tier done) and "ignition:stretch" (the extra star). */
export function recordFinish(completed, projectId, tier) {
  const out = new Set(completed);
  out.add(projectId);
  if (tier === 'stretch') out.add(`${projectId}:stretch`);
  return [...out];
}

export function starsFor(completed, projectId) {
  return { done: completed.includes(projectId), stretch: completed.includes(`${projectId}:stretch`) };
}

// ---------------------------------------------------------------- content QA

/** Problems with a lesson definition, as a list of readable strings. Empty list = good. Used by tests on every lesson. */
export function validateLesson(def, glossaryIds = [], formulaIds = []) {
  const problems = [];
  const bad = (msg) => problems.push(`${def.id ?? '?'}: ${msg}`);
  if (!def.id) bad('missing id');
  if (!def.title) bad('missing title');
  if (!Array.isArray(def.stages) || def.stages.length === 0) return [...problems, `${def.id}: no stages`];
  def.stages.forEach((st, i) => {
    const at = `stage ${i + 1} (${st.type})`;
    if (!STAGE_TYPES.includes(st.type)) return bad(`${at}: unknown type`);
    const texts = JSON.stringify(st);
    for (const t of termsIn(texts.replace(/\\"/g, '"'))) {
      if (!glossaryIds.includes(t)) bad(`${at}: glossary term [[${t}]] is not defined`);
    }
    if (st.type === 'equation' && !formulaIds.includes(st.formula)) bad(`${at}: formula "${st.formula}" not found`);
    if ((st.type === 'try' || st.type === 'maths') ) {
      for (const [qi, q] of (st.questions ?? []).entries()) {
        if (typeof q.answer !== 'number') bad(`${at} q${qi + 1}: answer must be a number`);
        if (!q.explain) bad(`${at} q${qi + 1}: needs an explanation (wrong answers must teach)`);
        if (!q.hints || q.hints.length < 1) bad(`${at} q${qi + 1}: needs at least one hint`);
      }
      if (!st.questions?.length) bad(`${at}: no questions`);
    }
    if (st.type === 'mission') {
      if (!st.goal) bad(`${at}: no goal`);
      if (!st.tiers?.standard) bad(`${at}: needs a standard tier`);
      if (!st.hints || st.hints.length < 3) bad(`${at}: needs three hint tiers`);
      for (const tier of Object.keys(st.tiers ?? {})) if (!TIERS.includes(tier)) bad(`${at}: unknown tier ${tier}`);
    }
    if (['briefing', 'learn', 'example', 'debrief'].includes(st.type) && !(st.lines || st.chunks || st.steps)) bad(`${at}: no content`);
  });
  return problems;
}
