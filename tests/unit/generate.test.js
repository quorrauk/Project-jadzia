import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evalExpr, instantiate, rng, hashSeed, fmt } from '../../src/lessons/generate.js';
import { createTracker, outcomeFor, UP_AFTER } from '../../src/lessons/adaptive.js';
import { checkAnswer } from '../../src/lessons/engine.js';

test('expressions: precedence, brackets, unary minus, powers, functions, comparisons', () => {
  assert.equal(evalExpr('2 + 3 * 4'), 14);
  assert.equal(evalExpr('(2 + 3) * 4'), 20);
  assert.equal(evalExpr('-2 + 5'), 3);
  assert.equal(evalExpr('2 ^ 3 ^ 1'), 8);
  assert.equal(evalExpr('V / R', { V: 9, R: 3 }), 3);
  assert.equal(evalExpr('sqrt(16) + max(1, 2)'), 6);
  assert.equal(evalExpr('1e-3 * 1000'), 1);
  assert.equal(evalExpr('3 <= 3'), 1);
  assert.equal(evalExpr('3 > 4'), 0);
  assert.equal(evalExpr('10 - 4 - 3'), 3);
  assert.equal(evalExpr('8 / 4 / 2'), 1);
});

test('expressions refuse anything that is not maths', () => {
  assert.throws(() => evalExpr('process.exit()'));
  assert.throws(() => evalExpr('x + 1'), /Unknown name/);
  assert.throws(() => evalExpr('2 +'));
  assert.throws(() => evalExpr('(1'));
  assert.throws(() => evalExpr('1 2'));
});

test('rng is deterministic per seed and differs between seeds', () => {
  const a = rng(1); const b = rng(1); const c = rng(2);
  assert.equal(a(), b());
  assert.notEqual(rng(1)(), c());
  assert.equal(hashSeed('x', 1), hashSeed('x', 1));
  assert.notEqual(hashSeed('x', 1), hashSeed('x', 2));
});

const OHM = {
  prompt: 'A {V} V battery and {R} ohms. How many amps?',
  explain: 'I = {V} ÷ {R} = {answer} A.',
  hints: ['I = V ÷ R. V is {V}.'],
  wrong: [{ expr: 'V * R', why: 'That is {V} × {R}. Divide instead.' }],
  gen: { vars: { V: { pick: [6, 9, 12] }, R: { pick: [2, 3, 6] } }, answer: 'V / R' },
};

test('instantiate: same seed gives the same question, different seeds give variety', () => {
  assert.deepEqual(instantiate(OHM, 5), instantiate(OHM, 5));
  const seen = new Set();
  for (let s = 0; s < 40; s++) seen.add(instantiate(OHM, s).prompt);
  assert.ok(seen.size >= 4, `only ${seen.size} different questions`);
});

test('instantiate: text is filled, answer correct, wrong-answer explanation uses the numbers', () => {
  const q = instantiate(OHM, 3);
  assert.doesNotMatch(q.prompt + q.explain + q.hints[0], /[{}]/);
  assert.equal(q.answer, q.values.V / q.values.R);
  assert.equal(checkAnswer(q, String(q.answer)).correct, true);
  const w = q.wrong.find((x) => x.value === q.values.V * q.values.R);
  if (w) assert.match(checkAnswer(q, String(w.value)).text, /Divide instead/);
});

test('instantiate: derived values, constraints and decimal places', () => {
  const q = { prompt: '{R}', explain: '{answer}', hints: ['h'], gen: {
    vars: { V: { pick: [9, 12] }, I: { min: 1, max: 6 } },
    derived: { R: 'V / I' },
    where: ['R == round(R)'],
    answer: 'V / R * 1.0001',
    dp: 2,
  } };
  for (let s = 0; s < 50; s++) {
    const r = instantiate(q, s);
    assert.equal(Number.isInteger(r.values.R), true);
    assert.equal(r.answer, Math.round(r.answer * 100) / 100);
  }
  assert.throws(() => instantiate({ prompt: 'x', explain: 'y', gen: { vars: { A: { pick: [1] } }, where: ['A > 5'], answer: 'A' } }, 1), /never satisfied/);
});

test('a question without gen passes through unchanged', () => {
  const q = { prompt: 'p', answer: 4, explain: 'e', hints: ['h'] };
  assert.deepEqual(instantiate(q, 99), q);
});

test('fmt drops float junk', () => {
  assert.equal(fmt(0.1 + 0.2), '0.3');
  assert.equal(fmt(24), '24');
  assert.equal(fmt(0.225), '0.225');
});

test('adaptive: three clean answers in a row move up one level, once', () => {
  const t = createTracker(1);
  for (let i = 0; i < UP_AFTER - 1; i++) assert.equal(t.record('clean'), null);
  assert.deepEqual(t.record('clean'), { from: 1, to: 2, direction: 'up' });
  assert.equal(t.level, 2);
  assert.equal(t.record('clean'), null, 'streak restarts after a move');
});

test('adaptive: ok answers break a clean streak but do not push down', () => {
  const t = createTracker(2);
  t.record('clean'); t.record('clean'); t.record('ok');
  assert.equal(t.record('clean'), null);
  assert.deepEqual(t.streaks, { clean: 1, struggles: 0 });
});

test('adaptive: two struggles in a row suggest a step down, never below 1 or above 5', () => {
  const t = createTracker(3);
  t.record('struggle');
  assert.deepEqual(t.record('struggle'), { from: 3, to: 2, direction: 'down' });
  const low = createTracker(1);
  low.record('struggle');
  assert.equal(low.record('struggle'), null);
  const high = createTracker(5);
  high.record('clean'); high.record('clean');
  assert.equal(high.record('clean'), null);
});

test('adaptive: a manual level choice wins and resets the counts', () => {
  const t = createTracker(1);
  t.record('clean'); t.record('clean');
  t.setLevel(4);
  assert.equal(t.level, 4);
  assert.deepEqual(t.streaks, { clean: 0, struggles: 0 });
  assert.equal(t.record('clean'), null);
});

test('outcomes: clean, ok and struggle', () => {
  assert.equal(outcomeFor({ wrongTries: 0, hints: 0, revealed: false }), 'clean');
  assert.equal(outcomeFor({ wrongTries: 1, hints: 0, revealed: false }), 'ok');
  assert.equal(outcomeFor({ wrongTries: 0, hints: 1, revealed: false }), 'ok');
  assert.equal(outcomeFor({ wrongTries: 2, hints: 0, revealed: false }), 'struggle');
  assert.equal(outcomeFor({ wrongTries: 0, hints: 0, revealed: true }), 'struggle');
});
