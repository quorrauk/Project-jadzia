// Sandbox board model. Pure data and functions, no DOM, so it runs in node tests and is JSON-safe
// (the board is saved per profile).
//
// The board is a grid. A part is a straight line of PART_LENGTH grid steps with a terminal at each end.
// Wires join terminals. For the solver, every terminal is a node named "<partId>.<a|b>" and every wire
// is a 1 mOhm wire component, so loops of wire are fine and shorts are detected for free.

import { solve, LED_FORWARD_VOLTAGE } from '../engine/index.js';

export const GRID = 40;
export const COLS = 24;
export const ROWS = 14;
export const PART_LENGTH = 4;

/** `engine` is the solver type. `defaults` are the only params a part may have. */
export const PART_TYPES = {
  battery: { label: 'Battery', prefix: 'B', defaults: { voltage: 4.5 }, info: 'Pushes electricity round the loop. The long line is the + side.' },
  bulb: { label: 'Bulb', prefix: 'BULB', defaults: {}, info: 'Glows when electricity flows through it. Too much and it pops.' },
  switch: { label: 'Switch', prefix: 'SW', defaults: { closed: false }, info: 'Tap it to open or close the gap in the loop.' },
  resistor: { label: 'Resistor', prefix: 'R', defaults: { resistance: 330 }, info: 'Squeezes the flow so parts like LEDs stay safe.' },
  variable_resistor: { label: 'Dimmer', prefix: 'VR', defaults: { resistance: 500, min: 0, max: 1000 }, info: 'A resistor you can slide. More squeeze, less flow.' },
  led: { label: 'LED', prefix: 'LED', defaults: { color: 'red' }, info: 'A tiny light. It needs a resistor or it burns out. Electricity only goes one way through it.' },
};

export function partLabel(part) {
  return PART_TYPES[part.type].label;
}

export function createBoard() {
  return { parts: [], wires: [], counters: {} };
}

export function clearBoard(board) {
  board.parts = [];
  board.wires = [];
  board.counters = {};
}

function nextId(board, prefix) {
  const n = (board.counters[prefix] || 0) + 1;
  board.counters[prefix] = n;
  return `${prefix}${n}`;
}

const findPart = (board, id) => board.parts.find((p) => p.id === id);

function getPart(board, id) {
  const part = findPart(board, id);
  if (!part) throw new Error(`No such part: ${id}`);
  return part;
}

// ---------------------------------------------------------------- geometry

export function footprint(x, y, rot) {
  const points = [];
  for (let i = 0; i <= PART_LENGTH; i++) points.push(rot ? { x, y: y + i } : { x: x + i, y });
  return points;
}

export function canPlace(board, x, y, rot, ignoreId) {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return { ok: false, reason: 'invalid' };
  const points = footprint(x, y, rot);
  if (points.some((p) => p.x < 0 || p.x > COLS || p.y < 0 || p.y > ROWS)) return { ok: false, reason: 'outside' };
  const taken = new Set();
  for (const part of board.parts) {
    if (part.id === ignoreId) continue;
    for (const p of footprint(part.x, part.y, part.rot)) taken.add(`${p.x},${p.y}`);
  }
  if (points.some((p) => taken.has(`${p.x},${p.y}`))) return { ok: false, reason: 'taken' };
  return { ok: true };
}

function parseTerminal(id) {
  const m = /^([^.]+)\.(a|b)$/.exec(String(id));
  return m ? { partId: m[1], end: m[2] } : null;
}

export function terminalPoint(board, terminalId) {
  const t = parseTerminal(terminalId);
  const part = t && findPart(board, t.partId);
  if (!part) throw new Error(`Unknown terminal: ${terminalId}`);
  const points = footprint(part.x, part.y, part.rot);
  return t.end === 'a' ? points[0] : points[PART_LENGTH];
}

/** Straight, or one right-angle bend (horizontal first). Points are in grid units. */
export function wirePath(from, to) {
  if (from.x === to.x || from.y === to.y) return [[from.x, from.y], [to.x, to.y]];
  return [[from.x, from.y], [to.x, from.y], [to.x, to.y]];
}

// ---------------------------------------------------------------- editing

export function addPart(board, type, x, y, opts = {}) {
  const def = PART_TYPES[type];
  if (!def) throw new TypeError(`Unknown part type "${type}"`);
  const rot = opts.rot ? 1 : 0;
  const fit = canPlace(board, x, y, rot);
  if (!fit.ok) return fit;
  const part = {
    id: nextId(board, def.prefix),
    type,
    x,
    y,
    rot,
    params: { ...def.defaults, ...(opts.params || {}) },
    burnt: false,
  };
  board.parts.push(part);
  return { ok: true, part };
}

export function movePart(board, id, x, y) {
  const part = getPart(board, id);
  const fit = canPlace(board, x, y, part.rot, id);
  if (!fit.ok) return fit;
  part.x = x;
  part.y = y;
  return { ok: true };
}

export function rotatePart(board, id) {
  const part = getPart(board, id);
  const rot = part.rot ? 0 : 1;
  const fit = canPlace(board, part.x, part.y, rot, id);
  if (!fit.ok) return fit;
  part.rot = rot;
  return { ok: true };
}

export function removePart(board, id) {
  getPart(board, id);
  board.parts = board.parts.filter((p) => p.id !== id);
  board.wires = board.wires.filter((w) => parseTerminal(w.from).partId !== id && parseTerminal(w.to).partId !== id);
}

export function setParam(board, id, key, value) {
  const part = getPart(board, id);
  if (!(key in PART_TYPES[part.type].defaults)) throw new Error(`Unknown parameter "${key}" for ${part.type}`);
  if (key === 'color' && !(value in LED_FORWARD_VOLTAGE)) throw new Error(`Unknown LED colour "${value}"`);
  if (key === 'closed' && typeof value !== 'boolean') throw new Error('closed must be true or false');
  if (['voltage', 'resistance', 'min', 'max'].includes(key)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`${key} must be a non-negative number`);
  }
  if (part.type === 'variable_resistor' && key === 'resistance') {
    value = Math.min(part.params.max, Math.max(part.params.min, value));
  }
  part.params[key] = value;
}

export function repairPart(board, id) {
  getPart(board, id).burnt = false;
}

export function addWire(board, from, to) {
  if (from === to) return { ok: false, reason: 'same-terminal' };
  for (const t of [from, to]) {
    const parsed = parseTerminal(t);
    if (!parsed || !findPart(board, parsed.partId)) return { ok: false, reason: 'unknown-terminal' };
  }
  if (board.wires.some((w) => (w.from === from && w.to === to) || (w.from === to && w.to === from))) {
    return { ok: false, reason: 'duplicate' };
  }
  const wire = { id: nextId(board, 'W'), from, to };
  board.wires.push(wire);
  return { ok: true, wire };
}

export function removeWire(board, id) {
  board.wires = board.wires.filter((w) => w.id !== id);
}

// ---------------------------------------------------------------- solving

/** Burnt parts are left out (an open gap). Every wire is a 1 mOhm wire component. */
export function toNetlist(board) {
  const parts = board.parts
    .filter((p) => !p.burnt)
    .map((p) => ({ id: p.id, type: p.type, ...p.params, nodes: [`${p.id}.a`, `${p.id}.b`] }));
  const wires = board.wires.map((w) => ({ id: w.id, type: 'wire', nodes: [w.from, w.to] }));
  return [...parts, ...wires];
}

/** Which node the solver treats as 0 V: the first battery's minus end. */
export function groundNode(netlist) {
  const bat = netlist.find((c) => c.type === 'battery');
  if (bat) return bat.nodes[1];
  return netlist[0] ? netlist[0].nodes[0] : null;
}

/**
 * Solve the board. Parts that would burn out are marked burnt (and stay burnt until repaired),
 * then the board is solved again without them. Returns the final result and who burnt just now.
 */
export function evaluate(board) {
  const justBurnt = [];
  let netlist;
  let result;
  for (let pass = 0; pass < 8; pass++) {
    netlist = toNetlist(board);
    result = solve(netlist);
    const fresh = [...new Set(result.flags.filter((f) => f.type === 'burnt-out' && f.id).map((f) => f.id))].filter((id) => {
      const p = findPart(board, id);
      return p && !p.burnt;
    });
    if (fresh.length === 0) break;
    for (const id of fresh) {
      findPart(board, id).burnt = true;
      justBurnt.push(id);
    }
  }
  return { result, netlist, justBurnt };
}

/** Sum of currents leaving a node (Kirchhoff current law says this is 0). */
export function kclResidual(netlist, result, node) {
  let sum = 0;
  for (const c of netlist) {
    const current = result.components[c.id].current;
    // Battery current is delivered out of + into the circuit: opposite sense to a passive part.
    const s = c.type === 'battery' ? -1 : 1;
    if (c.nodes[0] === node) sum += s * current;
    if (c.nodes[1] === node) sum -= s * current;
  }
  return sum;
}

// ---------------------------------------------------------------- starter

/** Battery, switch (open) and bulb in a loop. Tap the switch and the bulb lights. */
export function starterBoard() {
  const board = createBoard();
  addPart(board, 'battery', 4, 3, { rot: 1 });
  addPart(board, 'switch', 8, 3);
  addPart(board, 'bulb', 12, 5, { rot: 1 });
  addWire(board, 'B1.a', 'SW1.a');
  addWire(board, 'SW1.b', 'BULB1.a');
  addWire(board, 'BULB1.b', 'B1.b');
  return board;
}
