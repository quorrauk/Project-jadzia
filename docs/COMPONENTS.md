# Components and the solver

## How the solver works

`src/engine/solver.js` does DC modified nodal analysis (MNA).

- Unknowns: one voltage per node (ground excluded) plus one current per voltage source.
- Ground is node `"0"`. If no part uses `"0"`, the first battery's minus node is ground, else the first node.
- Parts that do not conduct right now (open switch, LED that is off) are not stamped. Each electrically separate island of nodes gets its own 0 V reference, so floating sections cannot make the matrix singular.
- Nonlinear parts (LED) keep an on/off state. The solver re-solves until no state changes (max 100 passes, else flag `no-convergence`).
- Parts are plugins. Capacitors and motors slot in later by registering a plugin; the solver does not change.

## API

```js
import { solve, hasFlag, withResistance } from './src/engine/index.js';

const result = solve([
  { id: 'b1',   type: 'battery',  voltage: 9,   nodes: ['in', '0'] },
  { id: 'r1',   type: 'resistor', resistance: 330, nodes: ['in', 'x'] },
  { id: 'led1', type: 'led',      color: 'red', nodes: ['x', '0'] },
]);
// result = { ok, flags, nodeVoltages: { in: 9, ... }, components: { r1: { current, voltage, power }, ... } }
```

Every part appears in `result.components[id]` with finite `current`, `voltage`, `power`. Numbers below 1e-12 are reported as 0.

### Sign conventions

| Part | `nodes` | `current` | `voltage` |
|------|---------|-----------|-----------|
| passive (resistor, wire, switch, bulb) | `[a, b]` | flows a to b | V(a) - V(b) |
| led | `[anode, cathode]` | flows anode to cathode | V(anode) - V(cathode) |
| battery | `[plus, minus]` | **delivered** out of plus into the circuit (positive when discharging) | V(plus) - V(minus) |

### Flags

`result.flags` is a list of `{ type, id?, message }`. Use `hasFlag(result, type, id?)`.

| type | meaning |
|------|---------|
| `short-circuit` | A battery delivers more than 10 A (`SHORT_CIRCUIT_CURRENT`). |
| `burnt-out` | LED above its `maxCurrent` (default 30 mA), or bulb at 2x or more of `ratedPower`. |
| `unsolvable` | No single answer (e.g. two batteries side by side). `ok` is false and all numbers are 0. |
| `no-convergence` | Nonlinear iteration did not settle. `ok` is false. |

The solver reports; it does not change the circuit. A burnt LED still shows the current it *would* carry. The caller (sandbox, lesson engine) decides what "burnt" looks like and whether to re-solve with the part removed.

`withResistance(components, id, ohms)` returns a copy with one resistor, variable resistor or bulb changed. The Python bridge's `set_resistance` will use it.

## Parts

| type | params (defaults) | notes |
|------|-------------------|-------|
| `battery` | `voltage` | Ideal source, no internal resistance. |
| `resistor` | `resistance` (ohms, >= 0) | 0 is treated as 1 mOhm. |
| `variable_resistor` | `resistance`, optional `min`, `max` | Solver only uses `resistance`; the sandbox will enforce min/max. |
| `wire` | none | Fixed 1 mOhm. |
| `switch` | `closed` (false) | Closed = 1 mOhm wire. Open = not stamped. |
| `bulb` | `resistance` (20), `ratedPower` (1 W) | Readout adds `brightness` (power / rated) and `lit` (brightness >= 0.1). About 4.5 V is "rated". |
| `led` | `color` (red), `maxCurrent` (0.03 A) | See below. Readout adds `lit` (>= 0.5 mA) and `brightness` (0 to 1, full at 20 mA). |

### The 1 mOhm rule

Wires and closed switches are 1 mOhm, not ideal zero-ohm sources. Loops of wires are normal in a sandbox and ideal zero-ohm loops make the matrix singular. The cost is a tiny error: a closed switch in series with 900 Ohm on 9 V gives 9.99999889 mA, not 10 mA. A battery wired straight across itself carries about 9000 A, which trips `short-circuit`.

### LED model and forward voltage per colour

Piecewise linear. Off (no current) below Vf. On above Vf with series resistance `LED_SERIES_RESISTANCE` = 2 Ohm, so `I = (V - Vf) / 2`. An "on" LED stays on within 1 uV of Vf to stop rounding flip-flop.

| Colour | Vf (V) |
|--------|--------|
| red | 2.0 |
| orange | 2.0 |
| yellow | 2.1 |
| green | 2.2 |
| blue | 3.0 |
| white | 3.2 |

Worked check: 9 V, 330 Ohm, red LED: I = (9 - 2) / (330 + 2) = 21.08 mA. A red LED straight across 9 V: I = 3.5 A, flagged `burnt-out`.

Simplifications to be honest about: real LEDs have a smooth knee, Vf shifts with current, and nothing models reverse breakdown. Good enough for the Year 8 to GCSE content; revisit if a project needs the curve.

## Adding a component

1. Create `src/engine/components/<name>.js` exporting a plugin object.
2. Register it in `src/engine/index.js`.
3. Add tests with hand-calculated numbers in `tests/unit/`.
4. Add a row to the Parts table above, in the same commit.

Plugin contract:

| member | required | purpose |
|--------|----------|---------|
| `type` | yes | String used in circuit JSON. |
| `defaults` | no | Param defaults merged under the user's values. |
| `validate(comp)` | no | Throw `TypeError` on bad params. |
| `stamp(ctx, comp, state)` | yes | Add to the matrix with `ctx.addConductance(a, b, g)`, `ctx.addCurrent(a, b, i)` (i amps flowing a to b through the part), `ctx.addVoltageSource(id, plus, minus, volts)`. |
| `sourceCount` | if it adds voltage sources | How many it adds. |
| `conducts(comp, state)` | no | False if the part currently connects nothing (open switch). Default true. |
| `initState(comp)` / `updateState(comp, volts, state)` | nonlinear only | Return true from `updateState` if the state changed. |
| `readout(comp, volts, extra, state)` | yes | Return `{ current, voltage, power, ...extras }`. `extra.sourceCurrent` is the MNA current for parts with a voltage source. |
| `flags(comp, readout)` | no | Return `[{ type, message }]`. |
| `draw` | later | Drawing for the sandbox is added at step 3. |
