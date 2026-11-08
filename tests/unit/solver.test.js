// Solver tests. Every expected number here is hand-calculated (working in comments).
// Convention reminder (see docs/COMPONENTS.md):
//   nodes: [a, b]. Node "0" is ground.
//   battery nodes: [plus, minus]. Reported current = current delivered out of the + terminal.
//   passive current = current flowing a -> b through the part. voltage = V(a) - V(b).
//   led nodes: [anode, cathode].

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solve, hasFlag, withResistance } from '../../src/engine/index.js';

const bat = (id, voltage, plus, minus = '0') => ({ id, type: 'battery', voltage, nodes: [plus, minus] });
const res = (id, resistance, a, b) => ({ id, type: 'resistor', resistance, nodes: [a, b] });
const led = (id, anode, cathode, color = 'red') => ({ id, type: 'led', color, nodes: [anode, cathode] });

function near(actual, expected, tol, label = '') {
  assert.ok(
    Number.isFinite(actual) && Math.abs(actual - expected) <= tol,
    `${label} expected ${expected} +/- ${tol}, got ${actual}`,
  );
}

function assertAllFinite(result) {
  for (const [node, v] of Object.entries(result.nodeVoltages)) {
    assert.ok(Number.isFinite(v), `node ${node} voltage is not finite: ${v}`);
  }
  for (const [id, c] of Object.entries(result.components)) {
    for (const key of ['current', 'voltage', 'power']) {
      assert.ok(Number.isFinite(c[key]), `${id}.${key} is not finite: ${c[key]}`);
    }
  }
}

// ---------------------------------------------------------------- kickoff cases

test('9 V battery across 1 kOhm: I = 9 mA, P = 81 mW', () => {
  // I = V/R = 9/1000 = 0.009 A. P = V*I = 9*0.009 = 0.081 W.
  const r = solve([bat('b1', 9, 'a'), res('r1', 1000, 'a', '0')]);
  assert.equal(r.ok, true);
  near(r.components.r1.current, 0.009, 1e-9, 'R current');
  near(r.components.r1.power, 0.081, 1e-9, 'R power');
  near(r.components.b1.current, 0.009, 1e-9, 'battery current');
  near(r.components.b1.power, 0.081, 1e-9, 'battery power');
  assert.deepEqual(r.flags, []);
});

test('two 100 Ohm in series on 10 V: I = 50 mA, 5 V across each', () => {
  // Rtotal = 200. I = 10/200 = 0.05 A. Each drop = 0.05*100 = 5 V.
  const r = solve([bat('b1', 10, 'in'), res('r1', 100, 'in', 'mid'), res('r2', 100, 'mid', '0')]);
  near(r.components.b1.current, 0.05, 1e-9, 'series current');
  near(r.components.r1.voltage, 5, 1e-9, 'R1 drop');
  near(r.components.r2.voltage, 5, 1e-9, 'R2 drop');
  near(r.nodeVoltages.mid, 5, 1e-9, 'midpoint');
});

test('two 100 Ohm in parallel on 10 V: total 50 Ohm, 200 mA total, 100 mA each', () => {
  // Each branch: 10/100 = 0.1 A. Total = 0.2 A. Req = 10/0.2 = 50 Ohm.
  const r = solve([bat('b1', 10, 'in'), res('r1', 100, 'in', '0'), res('r2', 100, 'in', '0')]);
  near(r.components.r1.current, 0.1, 1e-9, 'branch 1');
  near(r.components.r2.current, 0.1, 1e-9, 'branch 2');
  near(r.components.b1.current, 0.2, 1e-9, 'total');
  near(10 / r.components.b1.current, 50, 1e-6, 'equivalent resistance');
});

test('9 V, red LED (2 V forward), 330 Ohm: I about 21 mA', () => {
  // Red LED: Vf = 2.0 V, series resistance Rs = 2 Ohm (see COMPONENTS.md).
  // I = (9 - 2) / (330 + 2) = 7/332 = 0.021084 A.
  const r = solve([bat('b1', 9, 'in'), res('r1', 330, 'in', 'x'), led('led1', 'x', '0')]);
  near(r.components.led1.current, 7 / 332, 1e-6, 'LED current');
  near(r.components.led1.current, 0.021, 0.0005, 'about 21 mA');
  assert.equal(hasFlag(r, 'burnt-out'), false);
  // LED voltage = Vf + I*Rs = 2 + 0.021084*2 = 2.0422 V
  near(r.components.led1.voltage, 2 + (7 / 332) * 2, 1e-6, 'LED voltage');
});

test('unprotected LED across 9 V is flagged burnt-out', () => {
  // I = (9 - 2)/2 = 3.5 A, far above the 30 mA limit.
  const r = solve([bat('b1', 9, 'in', '0'), led('led1', 'in', '0')]);
  assert.equal(hasFlag(r, 'burnt-out', 'led1'), true);
  near(r.components.led1.current, 3.5, 1e-6, 'would-be current');
  assertAllFinite(r);
});

test('voltage divider 10 V, 1 kOhm over 2 kOhm: midpoint 6.67 V', () => {
  // Vmid = 10 * 2000 / (1000 + 2000) = 6.6667 V
  const r = solve([bat('b1', 10, 'in'), res('r1', 1000, 'in', 'mid'), res('r2', 2000, 'mid', '0')]);
  near(r.nodeVoltages.mid, 20 / 3, 1e-9, 'midpoint');
});

test('open circuit: 0 A everywhere, no crash, no flags', () => {
  // Resistor with one end connected to nothing.
  const r = solve([bat('b1', 9, 'a'), res('r1', 1000, 'a', 'dangling')]);
  assert.equal(r.ok, true);
  near(r.components.r1.current, 0, 1e-12, 'R current');
  near(r.components.b1.current, 0, 1e-12, 'battery current');
  assert.deepEqual(r.flags, []);
  assertAllFinite(r);
});

test('battery alone is an open circuit', () => {
  const r = solve([bat('b1', 9, 'a')]);
  assert.equal(r.ok, true);
  near(r.components.b1.current, 0, 1e-12);
  assertAllFinite(r);
});

test('short circuit: flagged, no NaN, no crash', () => {
  const r = solve([bat('b1', 9, 'a'), { id: 'w1', type: 'wire', nodes: ['a', '0'] }]);
  assert.equal(hasFlag(r, 'short-circuit'), true);
  assertAllFinite(r);
});

test('variable resistor sweep gives monotonic (falling) current', () => {
  // 9 V, 100 Ohm fixed + variable 0..1000 Ohm in series. I = 9 / (100 + Rv).
  const base = [
    bat('b1', 9, 'in'),
    res('rfix', 100, 'in', 'mid'),
    { id: 'vr1', type: 'variable_resistor', resistance: 0, min: 0, max: 1000, nodes: ['mid', '0'] },
  ];
  let previous = Infinity;
  for (let rv = 0; rv <= 1000; rv += 100) {
    const r = solve(withResistance(base, 'vr1', rv));
    const i = r.components.b1.current;
    near(i, 9 / (100 + rv), 1e-6, `Rv=${rv}`);
    assert.ok(i < previous, `current must fall as resistance rises (Rv=${rv})`);
    previous = i;
  }
});

// ---------------------------------------------------------------- extra coverage

test('Wheatstone bridge, balanced: no current in the bridge resistor', () => {
  // R1=R2=R3=R4=100, 10 V. Vl = Vr = 5 V, so I(R5) = 0.
  const r = solve([
    bat('b1', 10, 'in'),
    res('r1', 100, 'in', 'l'), res('r2', 100, 'l', '0'),
    res('r3', 100, 'in', 'r'), res('r4', 100, 'r', '0'),
    res('r5', 50, 'l', 'r'),
  ]);
  near(r.components.r5.current, 0, 1e-9, 'bridge current');
  near(r.nodeVoltages.l, 5, 1e-9);
  near(r.nodeVoltages.r, 5, 1e-9);
});

test('Wheatstone bridge, unbalanced (R4 = 300): hand-solved node voltages', () => {
  // KCL at l: 10 = 4*Vl - 2*Vr.  KCL at r: Vr = 3 + 0.6*Vl.
  // => Vl = 40/7 = 5.7143 V, Vr = 45/7 = 6.4286 V, I(R5, l->r) = (40/7 - 45/7)/50 = -1/70 A.
  const r = solve([
    bat('b1', 10, 'in'),
    res('r1', 100, 'in', 'l'), res('r2', 100, 'l', '0'),
    res('r3', 100, 'in', 'r'), res('r4', 300, 'r', '0'),
    res('r5', 50, 'l', 'r'),
  ]);
  near(r.nodeVoltages.l, 40 / 7, 1e-9, 'Vl');
  near(r.nodeVoltages.r, 45 / 7, 1e-9, 'Vr');
  near(r.components.r5.current, -1 / 70, 1e-9, 'bridge current');
});

test('two red LEDs in series on 9 V with 330 Ohm', () => {
  // I = (9 - 2 - 2) / (330 + 2 + 2) = 5/334 = 0.014970 A.
  const r = solve([
    bat('b1', 9, 'in'), res('r1', 330, 'in', 'x'),
    led('led1', 'x', 'y'), led('led2', 'y', '0'),
  ]);
  near(r.components.led1.current, 5 / 334, 1e-6);
  near(r.components.led2.current, 5 / 334, 1e-6);
  assert.equal(hasFlag(r, 'burnt-out'), false);
});

test('LED forward voltage depends on colour: blue (3 V) needs more headroom than red', () => {
  // Blue: I = (9 - 3)/(330 + 2) = 6/332 = 0.018072 A.
  const r = solve([bat('b1', 9, 'in'), res('r1', 330, 'in', 'x'), led('led1', 'x', '0', 'blue')]);
  near(r.components.led1.current, 6 / 332, 1e-6);
});

test('LED does not light below its forward voltage', () => {
  // 1.5 V cell cannot push a red LED (2 V). Current = 0.
  const r = solve([bat('b1', 1.5, 'in'), res('r1', 100, 'in', 'x'), led('led1', 'x', '0')]);
  near(r.components.led1.current, 0, 1e-12);
  assert.equal(r.components.led1.lit, false);
  assert.equal(hasFlag(r, 'burnt-out'), false);
});

test('LED connected backwards passes no current and is not flagged', () => {
  const r = solve([bat('b1', 9, 'in'), res('r1', 330, 'in', 'x'), led('led1', '0', 'x')]);
  near(r.components.led1.current, 0, 1e-12);
  assert.equal(r.components.led1.lit, false);
  assert.deepEqual(r.flags, []);
});

test('switch: closed conducts, open breaks the circuit', () => {
  const circuit = (closed) => [
    bat('b1', 9, 'in'),
    { id: 's1', type: 'switch', closed, nodes: ['in', 'x'] },
    res('r1', 900, 'x', '0'),
  ];
  // Closed switch is a 1 mOhm wire: I = 9 / 900.001 = 9.99999889 mA, so allow 1 uA.
  near(solve(circuit(true)).components.r1.current, 0.01, 1e-6, 'closed');
  near(solve(circuit(false)).components.r1.current, 0, 1e-12, 'open');
});

test('bulb: lights at rated power, flags burnt-out at double the rated power or more', () => {
  // Bulb 20 Ohm, rated 1 W. At 4.5 V: P = 4.5^2/20 = 1.0125 W -> lit, fine.
  // At 9 V: P = 81/20 = 4.05 W (over 2x rated) -> burnt-out.
  const bulb = { id: 'bulb1', type: 'bulb', resistance: 20, ratedPower: 1, nodes: ['in', '0'] };
  const ok = solve([bat('b1', 4.5, 'in'), bulb]);
  near(ok.components.bulb1.power, 1.0125, 1e-9, 'power');
  assert.equal(ok.components.bulb1.lit, true);
  assert.equal(hasFlag(ok, 'burnt-out'), false);

  const burnt = solve([bat('b1', 9, 'in'), bulb]);
  assert.equal(hasFlag(burnt, 'burnt-out', 'bulb1'), true);
});

test('loop of wires does not crash or produce NaN', () => {
  const r = solve([
    bat('b1', 9, 'a'),
    res('r1', 100, 'a', 'b'),
    { id: 'w1', type: 'wire', nodes: ['b', 'c'] },
    { id: 'w2', type: 'wire', nodes: ['c', 'd'] },
    { id: 'w3', type: 'wire', nodes: ['d', 'b'] },
    { id: 'w4', type: 'wire', nodes: ['d', '0'] },
  ]);
  // Ideal: 9/100 = 0.09 A. Wires add (w1+w2)||w3 + w4 = 1.667 mOhm, so I = 9/100.001667 = 0.0899985 A.
  near(r.components.r1.current, 9 / 100.0016666667, 1e-9);
  near(r.components.r1.current, 0.09, 1e-5);
  assertAllFinite(r);
});

test('two different batteries in parallel are flagged, not crashed', () => {
  const r = solve([bat('b1', 9, 'a'), bat('b2', 5, 'a')]);
  assert.equal(r.ok, false);
  assert.equal(hasFlag(r, 'unsolvable'), true);
  assertAllFinite(r);
});

test('circuit with no ground node still solves', () => {
  const r = solve([bat('b1', 9, 'p', 'n'), res('r1', 1000, 'p', 'n')]);
  near(r.components.r1.current, 0.009, 1e-9);
});

test('empty circuit is fine', () => {
  const r = solve([]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.components, {});
});

test('solve does not mutate its input', () => {
  const input = [bat('b1', 9, 'a'), res('r1', 1000, 'a', '0')];
  const copy = JSON.parse(JSON.stringify(input));
  solve(input);
  assert.deepEqual(input, copy);
});

test('malformed input throws a clear error', () => {
  assert.throws(() => solve([{ id: 'x', type: 'flux-capacitor', nodes: ['a', 'b'] }]), /Unknown component type/);
  assert.throws(() => solve([res('r1', 100, 'a', 'b'), res('r1', 100, 'b', '0')]), /Duplicate component id/);
  assert.throws(() => solve([res('r1', -5, 'a', 'b')]), /resistance/);
});

// ---------------------------------------------------------------- property checks

// Small seeded PRNG so failures are reproducible.
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomNetwork(rand, withLeds) {
  const nodes = ['0', 'n1', 'n2', 'n3', 'n4', 'n5'];
  const pick = () => nodes[Math.floor(rand() * nodes.length)];
  const parts = [bat('b1', 3 + Math.floor(rand() * 10), 'n1')];
  const count = 6 + Math.floor(rand() * 6);
  for (let i = 0; i < count; i++) {
    const a = pick();
    let b = pick();
    if (b === a) b = nodes[(nodes.indexOf(a) + 1) % nodes.length];
    if (withLeds && rand() < 0.4) parts.push(led(`d${i}`, a, b, ['red', 'green', 'blue'][Math.floor(rand() * 3)]));
    else parts.push(res(`r${i}`, 10 + Math.floor(rand() * 2000), a, b));
  }
  return parts;
}

function nodeResidual(parts, result, node) {
  // Sum of currents leaving the node through every part. Must be ~0 (KCL).
  let sum = 0;
  for (const p of parts) {
    const c = result.components[p.id].current;
    // Passives: current a -> b leaves node a and enters node b.
    // Battery: current is delivered out of the + terminal INTO the circuit, so it enters the + node
    // and leaves the - node (the opposite of a passive with the same node order).
    const sign = p.type === 'battery' ? -1 : 1;
    if (p.nodes[0] === node) sum += sign * c;
    if (p.nodes[1] === node) sum -= sign * c;
  }
  return sum;
}

for (const withLeds of [false, true]) {
  test(`random ${withLeds ? 'LED + resistor' : 'resistor'} networks: KCL holds, results finite, converges`, () => {
    const rand = mulberry32(withLeds ? 7 : 42);
    for (let n = 0; n < 300; n++) {
      const parts = randomNetwork(rand, withLeds);
      const r = solve(parts);
      assertAllFinite(r);
      if (r.ok === false) {
        // Only allowed failure: batteries forming an impossible loop (single battery here, so never).
        assert.fail(`network ${n} did not solve: ${JSON.stringify(r.flags)}`);
      }
      // Compare against the largest current in the network so tolerance scales with the circuit.
      const scale = Math.max(1e-6, ...Object.values(r.components).map((c) => Math.abs(c.current)));
      for (const node of Object.keys(r.nodeVoltages)) {
        assert.ok(
          Math.abs(nodeResidual(parts, r, node)) <= 1e-6 * scale + 1e-9,
          `network ${n}, node ${node}: KCL residual ${nodeResidual(parts, r, node)}`,
        );
      }
    }
  });
}
