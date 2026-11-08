import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  resolveDeep, resolveStage, linkTerms, termsIn, helpFor, parseNumber, checkAnswer, checkGoal,
  tierOffer, recordFinish, starsFor, validateLesson, MAX_RUNG,
} from '../../src/lessons/engine.js';
import { createBoard, addPart, addWire, starterBoard, setParam } from '../../src/sandbox/model.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../../content/${p}`, import.meta.url)));

test('variants: exact level wins, else nearest lower, else nearest higher', () => {
  const node = { text: { 1: 'one', 3: 'three' } };
  assert.equal(resolveDeep(node, 3).value.text, 'three');
  assert.deepEqual(resolveDeep(node, 3).fellBack, []);
  assert.equal(resolveDeep(node, 2).value.text, 'one');
  assert.deepEqual(resolveDeep(node, 2).fellBack, [1]);
  assert.equal(resolveDeep(node, 5).value.text, 'three');
  assert.equal(resolveDeep({ text: { 3: 'only three' } }, 1).value.text, 'only three');
});

test('plain strings and arrays are left alone; variants inside arrays resolve', () => {
  const { value, fellBack } = resolveDeep({ a: 'x', b: ['p', { 1: 'q', 2: 'r' }] }, 2);
  assert.deepEqual(value, { a: 'x', b: ['p', 'r'] });
  assert.deepEqual(fellBack, []);
  assert.equal(resolveStage({ type: 'learn', chunks: { 1: ['a'] } }, 4).fellBack[0], 1);
});

test('glossary markup splits into text and terms', () => {
  assert.deepEqual(linkTerms('A [[circuit]] and [[bulb]].'), [{ text: 'A ' }, { term: 'circuit' }, { text: ' and ' }, { term: 'bulb' }, { text: '.' }]);
  assert.deepEqual(termsIn('no terms'), []);
});

test('help ladder always answers, and caps at rung 4', () => {
  assert.equal(helpFor({}, 1).rung, 1);
  assert.equal(helpFor({}, 99).rung, MAX_RUNG);
  assert.ok(helpFor({}, 3).text.length > 0);
  assert.equal(helpFor({ help: { 2: 'custom' } }, 2).text, 'custom');
  assert.equal(helpFor({ help: { 2: 'custom' } }, 4).last, true);
});

test('number parsing accepts units, commas, standard form', () => {
  assert.equal(parseNumber('3'), 3);
  assert.equal(parseNumber(' 0.225 A '), 0.225);
  assert.equal(parseNumber('1,200 Ω'), 1200);
  assert.equal(parseNumber('2.25 x 10^-1'), 0.225);
  assert.equal(parseNumber('2.25 × 10^−1'), 0.225);
  assert.ok(Number.isNaN(parseNumber('abc')));
  assert.ok(Number.isNaN(parseNumber('')));
});

test('answers: right, near-miss in tolerance, known wrong, unknown wrong, unreadable', () => {
  const q = { answer: 3, explain: 'I = 9 ÷ 3.', wrong: [{ value: 27, why: 'You multiplied.' }] };
  assert.equal(checkAnswer(q, '3').correct, true);
  assert.equal(checkAnswer(q, '3.01').correct, true);
  assert.equal(checkAnswer(q, '27').text, 'You multiplied.');
  assert.match(checkAnswer(q, '5').text, /^Not quite\. I = 9/);
  assert.equal(checkAnswer(q, 'hello').understood, false);
});

test('tier offers: fail twice -> training; pass first time -> stretch; otherwise nothing', () => {
  const base = { tier: 'standard', hasStretch: true, hasTraining: true };
  assert.equal(tierOffer({ ...base, attempts: 2, passed: false }), 'training');
  assert.equal(tierOffer({ ...base, attempts: 1, passed: false }), null);
  assert.equal(tierOffer({ ...base, attempts: 1, passed: true }), 'stretch');
  assert.equal(tierOffer({ ...base, attempts: 3, passed: true }), null);
  assert.equal(tierOffer({ ...base, tier: 'training', attempts: 5, passed: false }), null);
  assert.equal(tierOffer({ ...base, hasStretch: false, attempts: 1, passed: true }), null);
});

test('progress: any tier completes, stretch earns the extra star', () => {
  let c = recordFinish([], 'ignition', 'training');
  assert.deepEqual(starsFor(c, 'ignition'), { done: true, stretch: false });
  c = recordFinish(c, 'ignition', 'stretch');
  assert.deepEqual(starsFor(c, 'ignition'), { done: true, stretch: true });
  assert.equal(recordFinish(c, 'ignition', 'standard').length, c.length);
});

function loop(switchClosed = true) {
  const b = createBoard();
  const bat = addPart(b, 'battery', 4, 3, { rot: 1 });
  const sw = addPart(b, 'switch', 8, 3);
  const bulb = addPart(b, 'bulb', 12, 5, { rot: 1 });
  return { b, bat, sw, bulb };
}

test('goal: starter circuit has an open switch (not met), closing it meets the lit goal', () => {
  const board = starterBoard();
  const goal = { type: 'lit', part: 'bulb', min: 1 };
  assert.equal(checkGoal(goal, board).met, false);
  const sw = board.parts.find((p) => p.type === 'switch');
  setParam(board, sw.id, 'closed', true);
  assert.equal(checkGoal(goal, board).met, true);
});

test('goal: empty board fails; checking never changes the board', () => {
  const board = createBoard();
  const before = JSON.stringify(board);
  assert.equal(checkGoal({ type: 'lit', part: 'bulb' }, board).met, false);
  assert.equal(JSON.stringify(board), before);
});

test('goal: all-of combines goals; no-burnt detects a popped part', () => {
  const board = starterBoard();
  const sw = board.parts.find((p) => p.type === 'switch');
  setParam(board, sw.id, 'closed', true);
  assert.equal(checkGoal({ all: [{ type: 'lit', part: 'bulb' }, { type: 'no-burnt' }] }, board).met, true);
  assert.equal(checkGoal({ all: [{ type: 'lit', part: 'bulb', min: 2 }, { type: 'no-burnt' }] }, board).met, false);
  assert.throws(() => checkGoal({ type: 'nope' }, board));
});

test('every shipped lesson passes content QA, at every level', () => {
  const glossary = read('glossary.json').terms.map((t) => t.id);
  const formulas = read('formulas.json').formulas.map((f) => f.id);
  const index = read('lessons.json').lessons;
  assert.ok(index.length >= 1);
  for (const entry of index) {
    const def = read(entry.file);
    assert.deepEqual(validateLesson(def, glossary, formulas), [], entry.id);
    for (const level of [1, 2, 3, 4, 5]) {
      for (const st of def.stages) assert.ok(resolveStage(st, level).type, `${entry.id} level ${level}`);
    }
  }
});

test('shipped lesson: standard mission is winnable from empty, stretch needs two bulbs', () => {
  const def = read('projects/ignition.json');
  const mission = def.stages.find((s) => s.type === 'mission');
  assert.equal(checkGoal(mission.goal, createBoard()).met, false);
  assert.equal(checkGoal(mission.goal, starterBoard()).met, false);
  assert.equal(mission.tiers.stretch.goal.min, 2);
});

test('glossary: every term has plain words for level 1; formula book entries have symbols', () => {
  for (const t of read('glossary.json').terms) assert.ok(t.plain['1'], `${t.id} needs a level 1 definition`);
  for (const f of read('formulas.json').formulas) {
    assert.ok(f.equation && f.symbols.length && f.rearranged.length && f.plain['1'], f.id);
  }
});

test('validateLesson catches the problems that would strand a learner', () => {
  const p = validateLesson({ id: 'x', title: 'X', stages: [
    { type: 'try', questions: [{ answer: 'no', hints: [] }] },
    { type: 'mission', tiers: {} },
    { type: 'learn', chunks: ['see [[ghost]]'] },
    { type: 'equation', formula: 'missing' },
    { type: 'bogus' },
  ] }, [], []);
  assert.ok(p.some((s) => /needs an explanation/.test(s)));
  assert.ok(p.some((s) => /at least one hint/.test(s)));
  assert.ok(p.some((s) => /standard tier/.test(s)));
  assert.ok(p.some((s) => /three hint tiers/.test(s)));
  assert.ok(p.some((s) => /ghost/.test(s)));
  assert.ok(p.some((s) => /not found/.test(s)));
  assert.ok(p.some((s) => /unknown type/.test(s)));
});
