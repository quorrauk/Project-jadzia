// LED. nodes: [anode, cathode].
// Piecewise-linear model: no current below the forward voltage Vf, then a small
// series resistance RS. When on, the part is stamped as a conductance 1/RS plus a
// constant current source, which makes it exactly: I = (V - Vf) / RS.
// The solver iterates the on/off state until it settles (see updateState).

/** Forward voltage per colour, in volts. Typical datasheet values at about 20 mA. */
export const LED_FORWARD_VOLTAGE = {
  red: 2.0,
  orange: 2.0,
  yellow: 2.1,
  green: 2.2,
  blue: 3.0,
  white: 3.2,
};

/** Series resistance of the "on" LED, ohms. */
export const LED_SERIES_RESISTANCE = 2;
/** Default maximum safe current, amps (30 mA). Above this the LED is flagged burnt-out. */
export const LED_MAX_CURRENT = 0.03;
/** Current at which we show the LED as visibly lit, amps. */
export const LED_LIT_CURRENT = 0.0005;
/** Current treated as full brightness, amps. */
export const LED_FULL_BRIGHTNESS_CURRENT = 0.02;
/** Volts. Dead band around Vf for the on/off decision (see updateState). */
const HYSTERESIS = 1e-6;

function vf(comp) {
  return LED_FORWARD_VOLTAGE[comp.color];
}

export const led = {
  type: 'led',
  defaults: { color: 'red', maxCurrent: LED_MAX_CURRENT },
  validate(comp) {
    if (!(comp.color in LED_FORWARD_VOLTAGE)) {
      throw new TypeError(
        `Component "${comp.id}": unknown LED colour "${comp.color}". Use one of: ${Object.keys(LED_FORWARD_VOLTAGE).join(', ')}`,
      );
    }
    if (typeof comp.maxCurrent !== 'number' || !(comp.maxCurrent > 0)) {
      throw new TypeError(`Component "${comp.id}": maxCurrent must be a positive number`);
    }
  },
  initState: () => ({ on: false }),
  conducts: (comp, state) => state.on,
  stamp(ctx, comp, state) {
    if (!state.on) return;
    const g = 1 / LED_SERIES_RESISTANCE;
    const [anode, cathode] = comp.nodes;
    ctx.addConductance(anode, cathode, g);
    // I = g*(Va - Vc) - g*Vf : the constant part is a current source of -g*Vf from anode to cathode.
    ctx.addCurrent(anode, cathode, -g * vf(comp));
  },
  /** Returns true if the on/off state changed. */
  updateState(comp, volts, state) {
    const vac = volts(comp.nodes[0]) - volts(comp.nodes[1]);
    // Hysteresis: an LED that is on but carrying (almost) no current sits exactly at Vf, where
    // rounding error would flip it back and forth. Staying on within HYSTERESIS of Vf avoids that.
    const shouldBeOn = state.on ? vac > vf(comp) - HYSTERESIS : vac > vf(comp) + HYSTERESIS;
    const changed = shouldBeOn !== state.on;
    state.on = shouldBeOn;
    return changed;
  },
  readout(comp, volts, extra, state) {
    const voltage = volts(comp.nodes[0]) - volts(comp.nodes[1]);
    const current = state.on ? Math.max(0, (voltage - vf(comp)) / LED_SERIES_RESISTANCE) : 0;
    return {
      current,
      voltage,
      power: voltage * current,
      lit: current >= LED_LIT_CURRENT,
      brightness: Math.min(1, current / LED_FULL_BRIGHTNESS_CURRENT),
    };
  },
  flags(comp, readout) {
    if (readout.current > comp.maxCurrent) {
      return [{ type: 'burnt-out', message: 'Too much current through the LED. It would burn out.' }];
    }
    return [];
  },
};
