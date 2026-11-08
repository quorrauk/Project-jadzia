// DC circuit solver: modified nodal analysis (MNA).
//
// Unknowns: one voltage per non-reference node, plus one current per voltage source.
// Nonlinear parts (LED) are handled by iterating their on/off state until it settles.
// Parts that do not conduct in their current state (open switch, LED that is off) are not
// stamped; to keep the matrix solvable each electrically separate "island" of nodes gets
// its own 0 V reference, so floating sections never produce a singular matrix.

import { solveLinear } from './linalg.js';
import { getComponentPlugin } from './registry.js';

const MAX_ITERATIONS = 100;
const CLEAN_EPSILON = 1e-12;

const clean = (v) => (Math.abs(v) < CLEAN_EPSILON ? 0 : v);

function prepare(raw, seen) {
  if (!raw || typeof raw !== 'object') throw new TypeError('Each component must be an object');
  const plugin = getComponentPlugin(raw.type);
  if (!plugin) throw new TypeError(`Unknown component type "${raw.type}" (component "${raw.id}")`);
  if (typeof raw.id !== 'string' || !raw.id) throw new TypeError('Each component needs a string id');
  if (seen.has(raw.id)) throw new TypeError(`Duplicate component id "${raw.id}"`);
  seen.add(raw.id);

  if (!Array.isArray(raw.nodes) || raw.nodes.length !== 2) {
    throw new TypeError(`Component "${raw.id}" needs nodes: [a, b]`);
  }
  const nodes = raw.nodes.map((n) => {
    if (typeof n !== 'string' && typeof n !== 'number') {
      throw new TypeError(`Component "${raw.id}" has an invalid node name`);
    }
    const s = String(n);
    if (!s) throw new TypeError(`Component "${raw.id}" has an empty node name`);
    return s;
  });

  const comp = { ...(plugin.defaults || {}), ...raw, nodes };
  if (plugin.validate) plugin.validate(comp);
  return { comp, plugin };
}

function findRoot(parent, i) {
  while (parent[i] !== i) {
    parent[i] = parent[parent[i]];
    i = parent[i];
  }
  return i;
}

function pickGround(nodes, parts) {
  if (nodes.includes('0')) return '0';
  const bat = parts.find((p) => p.comp.type === 'battery');
  return bat ? bat.comp.nodes[1] : nodes[0];
}

function assemble(parts, states, nodes, ground) {
  const nodeIndex = new Map(nodes.map((n, i) => [n, i]));

  // Islands of nodes joined by parts that conduct right now.
  const parent = nodes.map((_, i) => i);
  for (const { comp, plugin } of parts) {
    const conducts = plugin.conducts ? plugin.conducts(comp, states.get(comp.id)) : true;
    if (!conducts) continue;
    const a = findRoot(parent, nodeIndex.get(comp.nodes[0]));
    const b = findRoot(parent, nodeIndex.get(comp.nodes[1]));
    if (a !== b) parent[a] = b;
  }

  // Reference nodes: ground, plus the first node of every island that does not contain ground.
  const reference = new Set([nodeIndex.get(ground)]);
  const groundRoot = findRoot(parent, nodeIndex.get(ground));
  const islandHasReference = new Set([groundRoot]);
  nodes.forEach((_, i) => {
    const root = findRoot(parent, i);
    if (!islandHasReference.has(root)) {
      islandHasReference.add(root);
      reference.add(i);
    }
  });

  // Matrix row for each non-reference node (-1 for reference nodes).
  const rowOf = new Array(nodes.length).fill(-1);
  let nUnknownNodes = 0;
  nodes.forEach((_, i) => {
    if (!reference.has(i)) rowOf[i] = nUnknownNodes++;
  });
  const nSources = parts.reduce((sum, { plugin }) => sum + (plugin.sourceCount || 0), 0);
  const size = nUnknownNodes + nSources;

  const A = Array.from({ length: size }, () => new Array(size).fill(0));
  const b = new Array(size).fill(0);
  const sourceRow = new Map();
  let nextSource = nUnknownNodes;
  const row = (node) => rowOf[nodeIndex.get(node)];

  const ctx = {
    addConductance(a, c, g) {
      const ra = row(a);
      const rc = row(c);
      if (ra >= 0) A[ra][ra] += g;
      if (rc >= 0) A[rc][rc] += g;
      if (ra >= 0 && rc >= 0) {
        A[ra][rc] -= g;
        A[rc][ra] -= g;
      }
    },
    // A current source of i amps flowing from node a to node c through the part.
    addCurrent(a, c, i) {
      const ra = row(a);
      const rc = row(c);
      if (ra >= 0) b[ra] -= i;
      if (rc >= 0) b[rc] += i;
    },
    addVoltageSource(id, plus, minus, volts) {
      const k = nextSource++;
      sourceRow.set(id, k);
      const rp = row(plus);
      const rm = row(minus);
      if (rp >= 0) {
        A[rp][k] += 1;
        A[k][rp] += 1;
      }
      if (rm >= 0) {
        A[rm][k] -= 1;
        A[k][rm] -= 1;
      }
      b[k] = volts;
    },
  };

  for (const { comp, plugin } of parts) plugin.stamp(ctx, comp, states.get(comp.id));
  return { A, b, rowOf, nodeIndex, sourceRow };
}

function zeroResult(parts, nodes, flags) {
  const components = {};
  for (const { comp } of parts) components[comp.id] = { current: 0, voltage: 0, power: 0 };
  return {
    ok: false,
    flags,
    nodeVoltages: Object.fromEntries(nodes.map((n) => [n, 0])),
    components,
  };
}

/**
 * Solve a DC circuit.
 * @param {Array<object>} components  [{ id, type, nodes: [a, b], ...params }]
 * @returns {{ ok: boolean, flags: Array<{type, id?, message}>, nodeVoltages: object, components: object }}
 */
export function solve(components) {
  if (!Array.isArray(components)) throw new TypeError('solve() needs an array of components');

  const seen = new Set();
  const parts = components.map((raw) => prepare(raw, seen));
  const nodes = [...new Set(parts.flatMap(({ comp }) => comp.nodes))];
  if (parts.length === 0) return { ok: true, flags: [], nodeVoltages: {}, components: {} };

  const ground = pickGround(nodes, parts);
  const states = new Map(parts.map(({ comp, plugin }) => [comp.id, plugin.initState ? plugin.initState(comp) : null]));

  let built;
  let solution;
  let volts;
  let converged = false;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    built = assemble(parts, states, nodes, ground);
    solution = solveLinear(built.A, built.b);
    if (solution.singular) {
      return zeroResult(parts, nodes, [
        { type: 'unsolvable', message: 'Batteries are wired in a loop or side by side, so the circuit has no single answer.' },
      ]);
    }
    const x = solution.x;
    volts = (node) => {
      const r = built.rowOf[built.nodeIndex.get(node)];
      return r < 0 ? 0 : x[r];
    };

    let changed = false;
    for (const { comp, plugin } of parts) {
      if (plugin.updateState && plugin.updateState(comp, volts, states.get(comp.id))) changed = true;
    }
    if (!changed) {
      converged = true;
      break;
    }
  }

  const flags = [];
  if (!converged) {
    flags.push({ type: 'no-convergence', message: 'The solver could not settle on an answer for this circuit.' });
  }

  const out = {};
  for (const { comp, plugin } of parts) {
    const sourceRow = built.sourceRow.get(comp.id);
    const extra = { sourceCurrent: sourceRow === undefined ? 0 : solution.x[sourceRow] };
    const raw = plugin.readout(comp, volts, extra, states.get(comp.id));
    const readout = { ...raw };
    for (const key of ['current', 'voltage', 'power']) readout[key] = clean(raw[key]);

    if (['current', 'voltage', 'power'].some((k) => !Number.isFinite(readout[k]))) {
      return zeroResult(parts, nodes, [
        { type: 'unsolvable', id: comp.id, message: 'Numbers went out of range for this circuit.' },
      ]);
    }
    out[comp.id] = readout;
    if (plugin.flags) {
      for (const flag of plugin.flags(comp, readout)) flags.push({ ...flag, id: comp.id });
    }
  }

  const nodeVoltages = Object.fromEntries(nodes.map((n) => [n, clean(volts(n))]));
  return { ok: converged, flags, nodeVoltages, components: out };
}

export function hasFlag(result, type, id) {
  return result.flags.some((f) => f.type === type && (id === undefined || f.id === id));
}

/** Return a copy of the circuit with one part's resistance changed (resistor, variable_resistor, bulb). */
export function withResistance(components, id, resistance) {
  const target = components.find((c) => c.id === id);
  if (!target) throw new Error(`No component with id "${id}"`);
  if (!['resistor', 'variable_resistor', 'bulb'].includes(target.type)) {
    throw new Error(`Component "${id}" (${target.type}) has no resistance to change`);
  }
  return components.map((c) => (c.id === id ? { ...c, resistance } : c));
}
