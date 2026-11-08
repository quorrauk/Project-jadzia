// Lesson engine: pure logic, no DOM. The UI (src/ui/lessons.js) draws what this decides.
//
// Content is JSON. Any text can be a plain string or a variants object keyed by level ({"1": "...", "2": "..."}).
// The nearest lower level is used when the learner's exact level was not written (see pickForLevel).

import { pickForLevel, LEVEL_IDS } from '../progress/levels.js';
import { evaluate } from '../sandbox/model.js';
import { instantiate } from './generate.js';
import { boardFromSpec } from './boards.js';

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

const TIER_KEYS = ['training', 'standard', 'stretch'];

/**
 * Missions can carry several scenarios (different story, battery, targets) so a replay is a new challenge.
 * A scenario may override: story, parts, goal, and any tier (merged into the base tier).
 * `index` is taken modulo the number of scenarios, so replays can simply count up.
 */
export function pickScenario(stage, index) {
  const list = stage.scenarios;
  if (!list?.length) return { ...stage, scenarioId: null };
  const sc = list[((index % list.length) + list.length) % list.length];
  const { id, tiers, ...rest } = sc;
  const merged = { ...stage.tiers };
  for (const t of Object.keys(tiers ?? {})) merged[t] = { ...(stage.tiers?.[t] ?? {}), ...tiers[t] };
  return { ...stage, ...rest, tiers: merged, scenarioId: id ?? null, scenarios: undefined };
}


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
      const n = ofType.filter((p) => !p.burnt && reading(p).lit && (goal.brightness === undefined || (reading(p).brightness ?? 0) >= goal.brightness)).length;
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
    case 'brightness': {
      const ok = ofType.filter((p) => !p.burnt && (reading(p).brightness ?? 0) >= (goal.min ?? 0) && (reading(p).brightness ?? 0) <= (goal.max ?? Infinity));
      const met = ok.length >= (goal.count ?? 1);
      return { met, notes: met ? [] : ['the brightness is not in the right range yet'], note: 'the brightness is not in the right range yet' };
    }
    case 'has': {
      const n = ofType.filter((p) => !p.burnt).length;
      const met = n >= (goal.min ?? 1);
      return { met, notes: met ? [] : [`you need ${goal.min ?? 1} ${goal.part}`], note: `you need ${goal.min ?? 1} ${goal.part}` };
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
    if (st.type === 'try' || st.type === 'maths') {
      if (!st.questions?.length) bad(`${at}: no questions`);
      for (const [qi, qRaw] of (st.questions ?? []).entries()) {
        for (const level of LEVEL_IDS) {
          const q = resolveDeep(qRaw, level).value;
          const qat = `${at} q${qi + 1} level ${level}`;
          if (!q.gen && typeof q.answer !== 'number') bad(`${qat}: answer must be a number`);
          if (!q.prompt) bad(`${qat}: no prompt`);
          if (!q.explain) bad(`${qat}: needs an explanation (wrong answers must teach)`);
          if (!q.hints || q.hints.length < 1) bad(`${qat}: needs at least one hint`);
          if (!q.gen) continue;
          // Many seeds at every level: every draw must work, be fully filled in, and have a sensible answer.
          for (let seed = 0; seed < 40; seed++) {
            try {
              const inst = instantiate(q, seed);
              const text = [inst.prompt, inst.explain, ...inst.hints, ...inst.wrong.map((w) => w.why)].join(' ');
              if (/[{}]/.test(text)) { bad(`${qat}: unfilled {placeholder}`); break; }
              if (!Number.isFinite(inst.answer)) { bad(`${qat}: answer is not a number`); break; }
              if (inst.answer <= 0 && !q.allowNonPositive) { bad(`${qat}: answer ${inst.answer} is not positive`); break; }
            } catch (err) {
              bad(`${qat}: seed ${seed}: ${err.message}`);
              break;
            }
          }
        }
      }
    }
    if (st.type === 'python') {
      if (!st.task) bad(`${at}: no task`);
      if (typeof st.starter !== 'string') bad(`${at}: no starter code`);
      if (!st.expect || !st.expect.length) bad(`${at}: needs expect (what the output must contain)`);
      if (!st.hints || st.hints.length < 2) bad(`${at}: needs at least two hints`);
    }
    if (st.type === 'mission') {
      for (const [si, sc] of (st.scenarios ?? []).entries()) {
        const merged = pickScenario(st, si);
        if (!merged.goal) bad(`${at} scenario ${si + 1}: no goal`);
        for (const [tn, tier] of Object.entries(merged.tiers ?? {})) {
          try {
            const b = boardFromSpec(tier.start, { battery: sc.battery });
            if (tier.start === 'empty' || !tier.start) continue;
            if (!b.parts.length) bad(`${at} scenario ${si + 1} ${tn}: start board is empty`);
          } catch (err) {
            bad(`${at} scenario ${si + 1} ${tn}: ${err.message}`);
          }
        }
      }
      if (!st.goal && !st.scenarios?.every((sc) => sc.goal)) bad(`${at}: no goal`);
      // Never stuck: every scenario x tier has a solution that meets its goal, and the start board does not already meet it.
      const variants = st.scenarios?.length ? st.scenarios.map((_, i) => pickScenario(st, i)) : [pickScenario(st, 0)];
      for (const [vi, m] of variants.entries()) {
        for (const [tn, tier] of Object.entries(m.tiers ?? {})) {
          const where = `${at} scenario ${vi + 1} ${tn}`;
          const goal = tier.goal ?? m.goal;
          const solution = tier.solution ?? m.solution;
          if (!goal) continue;
          if (!solution) { bad(`${where}: no solution board (needed to prove the mission is winnable)`); continue; }
          try {
            const start = boardFromSpec(tier.start, { battery: m.battery });
            if (checkGoal(goal, start).met) bad(`${where}: already complete at the start`);
            const won = checkGoal(goal, boardFromSpec(solution, { battery: m.battery }));
            if (!won.met) bad(`${where}: the solution board does not meet the goal (${won.notes.join(', ')})`);
          } catch (err) {
            bad(`${where}: ${err.message}`);
          }
        }
      }
      if (!st.tiers?.standard) bad(`${at}: needs a standard tier`);
      if (!st.hints || st.hints.length < 3) bad(`${at}: needs three hint tiers`);
      for (const tier of Object.keys(st.tiers ?? {})) if (!TIERS.includes(tier)) bad(`${at}: unknown tier ${tier}`);
    }
    if (['briefing', 'learn', 'example', 'debrief'].includes(st.type) && !(st.lines || st.chunks || st.steps)) bad(`${at}: no content`);
  });
  return problems;
}
