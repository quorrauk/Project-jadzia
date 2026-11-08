// Start boards for missions, built from small specs in the lesson JSON.
//   "start": "empty" | "starter"
//   "start": { "from": "starter", "battery": 9 }
//   "start": { "build": [ {type, x, y, rot, params} ], "wires": [["B1.a", "R1.a"], ...] }
// Part ids are assigned in order per type (B1, B2, R1, LED1 ...), as in the workshop.

import { createBoard, starterBoard, addPart, addWire, setParam } from '../sandbox/model.js';

export function boardFromSpec(start, overrides = {}) {
  let board;
  const spec = typeof start === 'string' ? { from: start } : (start ?? { from: 'empty' });
  if (spec.build) {
    board = createBoard();
    for (const p of spec.build) {
      const r = addPart(board, p.type, p.x, p.y, { rot: p.rot, params: p.params });
      if (!r.ok) throw new Error(`Cannot place ${p.type} at ${p.x},${p.y}: ${r.reason}`);
      if (p.burnt) r.part.burnt = true;
    }
    for (const [a, b] of spec.wires ?? []) {
      const r = addWire(board, a, b);
      if (!r.ok) throw new Error(`Cannot wire ${a} to ${b}: ${r.reason}`);
    }
  } else {
    board = spec.from === 'starter' ? starterBoard() : createBoard();
  }
  const battery = overrides.battery ?? spec.battery;
  if (battery !== undefined) {
    for (const p of board.parts) if (p.type === 'battery') setParam(board, p.id, 'voltage', battery);
  }
  return board;
}
