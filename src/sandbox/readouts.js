// Level-aware readouts for the selected part. Same numbers at every level; what changes is
// the words and how much of the maths is shown. Nothing disappears as the level goes up.
//   1 Cadet          push / flow in plain words
//   2 Pilot          named quantities with symbols, and R = V ÷ I
//   3 Commander      adds power and standard form
//   4 Specialist     adds a Kirchhoff current check at the part's terminals
//   5 Chief Engineer adds the ground reference and the full node-voltage table

import { formatCurrent, formatVoltage, formatResistance, formatPower, standardForm } from './format.js';
import { PART_TYPES, groundNode, kclResidual, partLabel } from './model.js';

const TINY = 1e-9;
const RESISTIVE = ['resistor', 'variable_resistor', 'bulb'];

export function readoutLines({ level, partId, board, result, netlist }) {
  const part = board.parts.find((p) => p.id === partId);
  if (!part) return [];
  const name = `${partLabel(part)} ${part.id}`;
  if (part.burnt) return [`${name} is burnt out. Repair it to use it again.`];

  const r = result.components[partId];
  if (!r) return [];
  const { voltage: v, current: i, power: p } = r;
  const lines = [];

  if (level <= 1) {
    lines.push(`Push (voltage): ${formatVoltage(v)}`, `Flow (current): ${formatCurrent(i)}`);
    if (r.lit) lines.push('It is lit up!');
    return lines;
  }

  lines.push(`Voltage (V): ${formatVoltage(v)}`, `Current (I): ${formatCurrent(i)}`);
  if (RESISTIVE.includes(part.type)) {
    lines.push(
      Math.abs(i) > TINY
        ? `R = V ÷ I = ${formatResistance(v / i)}`
        : `Resistance (R): ${formatResistance(part.params.resistance ?? PART_TYPES.bulb.defaults.resistance ?? 20)} (no current, so V ÷ I can't be worked out)`,
    );
  }
  if (r.lit) lines.push('It is lit up!');

  if (level >= 3) {
    lines.push(`P = V × I = ${formatPower(p)}`, `I in standard form: ${standardForm(i)} A`);
  }

  if (level >= 4) {
    for (const end of ['a', 'b']) {
      const node = `${part.id}.${end}`;
      lines.push(`Kirchhoff at ${node}: current in − current out = ${formatCurrent(kclResidual(netlist, result, node))} (should be 0)`);
    }
  }

  if (level >= 5) {
    const nodes = Object.keys(result.nodeVoltages).sort();
    const sources = netlist.filter((c) => c.type === 'battery').length;
    lines.push(
      `Ground (0 V): ${groundNode(netlist)}`,
      `Solver: ${Math.max(0, nodes.length - 1)} unknown voltages + ${sources} source current${sources === 1 ? '' : 's'} (nodal analysis)`,
      ...nodes.map((n) => `V(${n}) = ${formatVoltage(result.nodeVoltages[n])}`),
    );
  }
  return lines;
}
