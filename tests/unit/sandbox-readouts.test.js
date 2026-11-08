import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCurrent, formatVoltage, formatResistance, formatPower, standardForm,
} from '../../src/sandbox/format.js';
import { readoutLines } from '../../src/sandbox/readouts.js';
import { evaluate, starterBoard, setParam } from '../../src/sandbox/model.js';

// ---------------------------------------------------------------- number formatting

test('current: amps, milliamps, microamps, 3 significant figures', () => {
  assert.equal(formatCurrent(0), '0 A');
  assert.equal(formatCurrent(0.009), '9 mA');
  assert.equal(formatCurrent(7 / 332), '21.1 mA');
  assert.equal(formatCurrent(1.25), '1.25 A');
  assert.equal(formatCurrent(0.0000456), '45.6 µA');
  assert.equal(formatCurrent(-0.02), '-20 mA');
});

test('voltage', () => {
  assert.equal(formatVoltage(4.5), '4.5 V');
  assert.equal(formatVoltage(0), '0 V');
  assert.equal(formatVoltage(20 / 3), '6.67 V');
  assert.equal(formatVoltage(0.0123), '12.3 mV');
});

test('resistance', () => {
  assert.equal(formatResistance(330), '330 Ω');
  assert.equal(formatResistance(1000), '1 kΩ');
  assert.equal(formatResistance(4700), '4.7 kΩ');
  assert.equal(formatResistance(2200000), '2.2 MΩ');
});

test('power', () => {
  assert.equal(formatPower(0.081), '81 mW');
  assert.equal(formatPower(1.0125), '1.01 W');
  assert.equal(formatPower(0), '0 W');
});

test('standard form', () => {
  assert.equal(standardForm(0), '0');
  assert.equal(standardForm(0.225), '2.25 × 10⁻¹');
  assert.equal(standardForm(4500), '4.5 × 10³');
  assert.equal(standardForm(0.0000456), '4.56 × 10⁻⁵');
  assert.equal(standardForm(1), '1 × 10⁰');
  assert.equal(standardForm(9.9996), '1 × 10¹', 'rounding up carries into the exponent');
});

// ---------------------------------------------------------------- level-aware readouts

function litStarter() {
  const board = starterBoard();
  setParam(board, 'SW1', 'closed', true);
  const ev = evaluate(board);
  return { board, ...ev };
}

const linesFor = (level, id) => {
  const { board, result, netlist } = litStarter();
  return readoutLines({ level, partId: id, board, result, netlist });
};

test('level 1 (Cadet) uses plain words: push and flow', () => {
  const lines = linesFor(1, 'BULB1').join('\n');
  assert.match(lines, /push/i);
  assert.match(lines, /flow/i);
  assert.doesNotMatch(lines, /V = I/, 'no equations yet');
  assert.doesNotMatch(lines, /KCL|node/i);
});

test('level 2 (Pilot) names the quantities, shows units and checks Ohm\'s law', () => {
  const lines = linesFor(2, 'BULB1').join('\n');
  assert.match(lines, /Voltage \(V\)/);
  assert.match(lines, /Current \(I\)/);
  assert.match(lines, /R = V ÷ I/);
  assert.match(lines, /20 Ω/, 'bulb is 20 ohm (to within wire resistance rounding)');
});

test('level 3 (Commander) adds power and standard form', () => {
  const lines = linesFor(3, 'BULB1').join('\n');
  assert.match(lines, /P = V × I/);
  assert.match(lines, /1\.01 W/);
  assert.match(lines, /×\s*10/);
});

test('level 4 (Specialist) adds a Kirchhoff current check at the part\'s terminals', () => {
  const lines = linesFor(4, 'BULB1').join('\n');
  assert.match(lines, /Kirchhoff/i);
  assert.match(lines, /BULB1\.a/);
  assert.match(lines, /BULB1\.b/);
});

test('level 5 (Chief Engineer) adds the node-voltage table and the ground reference', () => {
  const lines = linesFor(5, 'BULB1').join('\n');
  assert.match(lines, /ground/i);
  assert.match(lines, /B1\.b/);
  assert.match(lines, /V\(BULB1\.a\)/);
});

test('every level includes the lower levels\' idea in some form (nothing vanishes as she climbs)', () => {
  for (let level = 1; level <= 5; level++) {
    const lines = linesFor(level, 'BULB1').join('\n');
    assert.match(lines, /4\.5|4\.49|4\.4|4\.5/i, `level ${level} should mention the voltage across the bulb`);
    assert.match(lines, /225|224|223|mA/, `level ${level} should mention the current`);
  }
});

test('battery readout works at every level and shows delivered current', () => {
  for (let level = 1; level <= 5; level++) {
    const lines = linesFor(level, 'B1').join('\n');
    assert.match(lines, /mA/, `level ${level}`);
  }
});

test('an open switch reads zero current without errors at every level', () => {
  for (let level = 1; level <= 5; level++) {
    const board = starterBoard();
    const { result, netlist } = evaluate(board);
    const lines = readoutLines({ level, partId: 'BULB1', board, result, netlist });
    assert.ok(lines.length > 0, `level ${level}`);
    assert.ok(lines.every((l) => !/NaN|undefined|Infinity/.test(l)), `level ${level}: ${lines.join(' | ')}`);
  }
});

test('a burnt part says so instead of showing numbers', () => {
  const board = starterBoard();
  setParam(board, 'SW1', 'closed', true);
  setParam(board, 'B1', 'voltage', 12);
  const { result, netlist } = evaluate(board);
  const lines = readoutLines({ level: 2, partId: 'BULB1', board, result, netlist }).join('\n');
  assert.match(lines, /burnt/i);
});
