import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasFlag } from '../../src/engine/index.js';
import {
  COLS, ROWS, PART_LENGTH,
  createBoard, addPart, movePart, rotatePart, removePart, addWire, removeWire,
  setParam, repairPart, clearBoard, terminalPoint, canPlace, toNetlist, evaluate,
  starterBoard, wirePath, kclResidual, partLabel,
} from '../../src/sandbox/model.js';
import { statusFor } from '../../src/sandbox/messages.js';

const near = (a, b, tol, label = '') =>
  assert.ok(Math.abs(a - b) <= tol, `${label} expected ${b} +/- ${tol}, got ${a}`);

/** Battery + bulb in a simple loop, 4.5 V. */
function bulbLoop() {
  const board = createBoard();
  const b = addPart(board, 'battery', 2, 3).part;
  const l = addPart(board, 'bulb', 8, 3).part;
  addWire(board, `${b.id}.a`, `${l.id}.a`);
  addWire(board, `${l.id}.b`, `${b.id}.b`);
  return board;
}

// ---------------------------------------------------------------- parts

test('parts get friendly ids and default params', () => {
  const board = createBoard();
  assert.equal(addPart(board, 'battery', 0, 0).part.id, 'B1');
  assert.equal(addPart(board, 'battery', 0, 2).part.id, 'B2');
  const r = addPart(board, 'resistor', 6, 0).part;
  assert.equal(r.id, 'R1');
  assert.equal(r.params.resistance, 330);
  assert.equal(addPart(board, 'led', 0, 4).part.params.color, 'red');
  assert.equal(addPart(board, 'variable_resistor', 6, 4).part.id, 'VR1');
  assert.equal(addPart(board, 'switch', 0, 6).part.params.closed, false);
});

test('unknown part types are rejected', () => {
  assert.throws(() => addPart(createBoard(), 'flux-capacitor', 0, 0), /Unknown part type/);
});

test('parts must stay on the board', () => {
  const board = createBoard();
  assert.deepEqual(addPart(board, 'bulb', -1, 2), { ok: false, reason: 'outside' });
  assert.deepEqual(addPart(board, 'bulb', COLS - PART_LENGTH + 1, 2), { ok: false, reason: 'outside' });
  assert.deepEqual(addPart(board, 'bulb', 2, ROWS + 1), { ok: false, reason: 'outside' });
  assert.equal(addPart(board, 'bulb', COLS - PART_LENGTH, ROWS).ok, true, 'exactly on the edge is fine');
});

test('parts cannot share grid points, but can sit on neighbouring rows', () => {
  const board = createBoard();
  addPart(board, 'bulb', 4, 4);
  assert.deepEqual(addPart(board, 'bulb', 4, 4), { ok: false, reason: 'taken' });
  assert.deepEqual(addPart(board, 'bulb', 8, 4), { ok: false, reason: 'taken' }, 'end to end shares a terminal point');
  assert.deepEqual(addPart(board, 'bulb', 6, 4), { ok: false, reason: 'taken' });
  assert.equal(addPart(board, 'bulb', 4, 5).ok, true);
  assert.equal(addPart(board, 'bulb', 9, 4).ok, true);
});

test('vertical parts occupy a column', () => {
  const board = createBoard();
  addPart(board, 'bulb', 4, 2, { rot: 1 });
  assert.equal(canPlace(board, 4, 5, 0).ok, false, 'horizontal part crossing the column');
  assert.equal(canPlace(board, 5, 2, 1).ok, true);
});

test('rotate turns a part, and refuses if it would hit something or leave the board', () => {
  const board = createBoard();
  const p = addPart(board, 'bulb', 4, 4).part;
  assert.equal(rotatePart(board, p.id).ok, true);
  assert.equal(p.rot, 1);
  addPart(board, 'bulb', 3, 6); // sits on (3..7, 6), blocking the vertical bulb at (4, 4..8)
  const after = rotatePart(board, p.id);
  assert.deepEqual(after, { ok: true });
  assert.equal(p.rot, 0, 'rotated back to horizontal is allowed');
  // now block horizontal->vertical
  const board2 = createBoard();
  const q = addPart(board2, 'bulb', 4, 4).part;
  addPart(board2, 'bulb', 3, 6);
  assert.deepEqual(rotatePart(board2, q.id), { ok: false, reason: 'taken' });
  assert.equal(q.rot, 0, 'unchanged after a refused rotate');
});

test('move validates the new spot and ignores the part itself', () => {
  const board = createBoard();
  const a = addPart(board, 'bulb', 4, 4).part;
  addPart(board, 'bulb', 4, 8);
  assert.deepEqual(movePart(board, a.id, 4, 8), { ok: false, reason: 'taken' });
  assert.deepEqual(movePart(board, a.id, 30, 4), { ok: false, reason: 'outside' });
  assert.deepEqual(movePart(board, a.id, 5, 4), { ok: true }, 'sliding over its own old spot is fine');
  assert.equal(a.x, 5);
});

test('terminals sit at the two ends of the part', () => {
  const board = createBoard();
  const h = addPart(board, 'battery', 3, 5).part;
  assert.deepEqual(terminalPoint(board, 'B1.a'), { x: 3, y: 5 });
  assert.deepEqual(terminalPoint(board, 'B1.b'), { x: 7, y: 5 });
  rotatePart(board, h.id);
  assert.deepEqual(terminalPoint(board, 'B1.b'), { x: 3, y: 9 });
  assert.throws(() => terminalPoint(board, 'B9.a'), /Unknown terminal/);
});

test('setParam changes known params only', () => {
  const board = createBoard();
  const b = addPart(board, 'battery', 0, 0).part;
  setParam(board, b.id, 'voltage', 9);
  assert.equal(b.params.voltage, 9);
  assert.throws(() => setParam(board, b.id, 'colour', 'red'), /Unknown parameter/);
  assert.throws(() => setParam(board, 'B9', 'voltage', 9), /No such part/);
});

test('labels are friendly', () => {
  const board = createBoard();
  assert.equal(partLabel(addPart(board, 'variable_resistor', 0, 0).part), 'Dimmer');
});

// ---------------------------------------------------------------- wires

test('wires join two different terminals once only', () => {
  const board = createBoard();
  addPart(board, 'battery', 0, 0);
  addPart(board, 'bulb', 8, 0);
  const w = addWire(board, 'B1.a', 'BULB1.a');
  assert.equal(w.ok, true);
  assert.equal(w.wire.id, 'W1');
  assert.deepEqual(addWire(board, 'B1.a', 'B1.a'), { ok: false, reason: 'same-terminal' });
  assert.deepEqual(addWire(board, 'BULB1.a', 'B1.a'), { ok: false, reason: 'duplicate' }, 'either direction');
  assert.deepEqual(addWire(board, 'B1.a', 'NOPE.a'), { ok: false, reason: 'unknown-terminal' });
  assert.equal(addWire(board, 'B1.b', 'BULB1.a').ok, true, 'a terminal can take several wires');
});

test('removing a part removes only its wires', () => {
  const board = bulbLoop();
  addPart(board, 'resistor', 14, 8);
  removePart(board, 'BULB1');
  assert.equal(board.parts.some((p) => p.id === 'BULB1'), false);
  assert.equal(board.wires.length, 0);
  assert.equal(board.parts.length, 2);
});

test('removeWire and clearBoard', () => {
  const board = bulbLoop();
  removeWire(board, 'W1');
  assert.deepEqual(board.wires.map((w) => w.id), ['W2']);
  clearBoard(board);
  assert.deepEqual([board.parts.length, board.wires.length], [0, 0]);
  assert.equal(addPart(board, 'battery', 0, 0).part.id, 'B1', 'numbering starts again');
});

test('wire path is straight or one right-angle bend', () => {
  assert.deepEqual(wirePath({ x: 1, y: 2 }, { x: 5, y: 2 }), [[1, 2], [5, 2]]);
  assert.deepEqual(wirePath({ x: 1, y: 2 }, { x: 1, y: 6 }), [[1, 2], [1, 6]]);
  assert.deepEqual(wirePath({ x: 1, y: 2 }, { x: 5, y: 6 }), [[1, 2], [5, 2], [5, 6]]);
});

// ---------------------------------------------------------------- netlist and evaluate

test('netlist: parts keep their params, wires become 1 mOhm wires, burnt parts vanish', () => {
  const board = bulbLoop();
  const nl = toNetlist(board);
  assert.deepEqual(nl.find((c) => c.id === 'B1'), { id: 'B1', type: 'battery', voltage: 4.5, nodes: ['B1.a', 'B1.b'] });
  assert.deepEqual(nl.find((c) => c.id === 'W1'), { id: 'W1', type: 'wire', nodes: ['B1.a', 'BULB1.a'] });
  board.parts.find((p) => p.id === 'BULB1').burnt = true;
  assert.equal(toNetlist(board).some((c) => c.id === 'BULB1'), false);
});

test('battery and bulb loop lights the bulb', () => {
  const board = bulbLoop();
  const { result, justBurnt } = evaluate(board);
  assert.deepEqual(justBurnt, []);
  assert.equal(result.components.BULB1.lit, true);
  near(result.components.B1.current, 4.5 / 20, 1e-4, 'battery current');
});

test('an incomplete loop carries no current', () => {
  const board = bulbLoop();
  removeWire(board, 'W2');
  const { result } = evaluate(board);
  near(result.components.B1.current, 0, 1e-9);
  assert.equal(result.components.BULB1.lit, false);
});

test('starter circuit: switch open = dark, switch closed = glowing bulb', () => {
  const board = starterBoard();
  assert.equal(evaluate(board).result.components.BULB1.lit, false);
  setParam(board, 'SW1', 'closed', true);
  const after = evaluate(board);
  assert.equal(after.result.components.BULB1.lit, true);
  assert.equal(after.justBurnt.length, 0, 'the starter circuit must be safe');
});

test('an unprotected LED burns out, then the circuit goes quiet', () => {
  const board = createBoard();
  addPart(board, 'battery', 2, 3);
  addPart(board, 'led', 8, 3);
  addWire(board, 'B1.a', 'LED1.a');
  addWire(board, 'LED1.b', 'B1.b');
  const first = evaluate(board);
  assert.deepEqual(first.justBurnt, ['LED1']);
  assert.equal(board.parts.find((p) => p.id === 'LED1').burnt, true);
  near(first.result.components.B1.current, 0, 1e-9, 'burnt LED opens the circuit');
  assert.deepEqual(evaluate(board).justBurnt, [], 'already burnt, not news');
});

test('repair brings a burnt part back (and it can burn again)', () => {
  const board = createBoard();
  addPart(board, 'battery', 2, 3);
  addPart(board, 'led', 8, 3);
  addWire(board, 'B1.a', 'LED1.a');
  addWire(board, 'LED1.b', 'B1.b');
  evaluate(board);
  repairPart(board, 'LED1');
  assert.equal(board.parts.find((p) => p.id === 'LED1').burnt, false);
  assert.deepEqual(evaluate(board).justBurnt, ['LED1']);
});

test('adding a resistor makes the LED safe (the lesson in one test)', () => {
  const board = createBoard();
  addPart(board, 'battery', 2, 3);
  addPart(board, 'resistor', 8, 3);
  addPart(board, 'led', 14, 3);
  addWire(board, 'B1.a', 'R1.a');
  addWire(board, 'R1.b', 'LED1.a');
  addWire(board, 'LED1.b', 'B1.b');
  const { result, justBurnt } = evaluate(board);
  assert.deepEqual(justBurnt, []);
  assert.equal(result.components.LED1.lit, true);
  // I = (4.5 - 2) / (330 + 2) = 7.53 mA
  near(result.components.LED1.current, 2.5 / 332, 1e-6);
});

test('a battery wired straight across itself is a short circuit, and the battery is not "burnt"', () => {
  const board = createBoard();
  addPart(board, 'battery', 2, 3);
  addWire(board, 'B1.a', 'B1.b');
  const { result } = evaluate(board);
  assert.equal(hasFlag(result, 'short-circuit'), true);
  assert.equal(board.parts[0].burnt, false);
});

test('a board survives being saved and loaded as JSON', () => {
  const board = starterBoard();
  setParam(board, 'SW1', 'closed', true);
  const copy = JSON.parse(JSON.stringify(board));
  assert.equal(evaluate(copy).result.components.BULB1.lit, true);
  assert.equal(addPart(copy, 'resistor', 14, 11).part.id, 'R1', 'counters survive the round trip');
});

test('Kirchhoff current law holds at every node of the starter circuit', () => {
  const board = starterBoard();
  setParam(board, 'SW1', 'closed', true);
  const { result, netlist } = evaluate(board);
  for (const node of Object.keys(result.nodeVoltages)) {
    near(kclResidual(netlist, result, node), 0, 1e-9, `node ${node}`);
  }
});

// ---------------------------------------------------------------- friendly messages

const status = (board) => {
  const ev = evaluate(board);
  return statusFor({ board, result: ev.result, justBurnt: ev.justBurnt });
};

test('message: empty board asks for a battery', () => {
  const s = status(createBoard());
  assert.equal(s.tone, 'info');
  assert.match(s.text, /battery/i);
});

test('message: open switch is called out', () => {
  const s = status(starterBoard());
  assert.match(s.text, /switch/i);
});

test('message: no loop explains what a loop is', () => {
  const board = bulbLoop();
  removeWire(board, 'W2');
  assert.match(status(board).text, /loop/i);
});

test('message: working circuit celebrates', () => {
  const s = status(bulbLoop());
  assert.equal(s.tone, 'good');
  assert.match(s.text, /glow|lights? on|flowing/i);
});

test('message: burnt LED is funny and says what to try', () => {
  const board = createBoard();
  addPart(board, 'battery', 2, 3);
  addPart(board, 'led', 8, 3);
  addWire(board, 'B1.a', 'LED1.a');
  addWire(board, 'LED1.b', 'B1.b');
  const s = status(board);
  assert.equal(s.tone, 'bad');
  assert.match(s.text, /LED1/);
  assert.match(s.text, /retired early/i);
  assert.match(s.text, /resistor/i);
});

test('message: burnt part that stays burnt is a gentle reminder', () => {
  const board = createBoard();
  addPart(board, 'battery', 2, 3);
  addPart(board, 'led', 8, 3);
  addWire(board, 'B1.a', 'LED1.a');
  addWire(board, 'LED1.b', 'B1.b');
  evaluate(board);
  const s = status(board);
  assert.equal(s.tone, 'warn');
  assert.match(s.text, /repair/i);
});

test('message: short circuit', () => {
  const board = createBoard();
  addPart(board, 'battery', 2, 3);
  addWire(board, 'B1.a', 'B1.b');
  const s = status(board);
  assert.equal(s.tone, 'bad');
  assert.match(s.text, /short circuit/i);
});

test('message: batteries side by side are explained, not a crash', () => {
  const board = createBoard();
  addPart(board, 'battery', 0, 0);
  addPart(board, 'battery', 0, 2);
  setParam(board, 'B2', 'voltage', 9);
  addWire(board, 'B1.a', 'B2.a');
  addWire(board, 'B1.b', 'B2.b');
  const s = status(board);
  assert.equal(s.tone, 'bad');
  assert.match(s.text, /batteries/i);
});

test('message: equal batteries side by side just sit there, no drama', () => {
  const board = createBoard();
  addPart(board, 'battery', 0, 0);
  addPart(board, 'battery', 0, 2);
  addWire(board, 'B1.a', 'B2.a');
  addWire(board, 'B1.b', 'B2.b');
  assert.equal(status(board).tone, 'info');
});
