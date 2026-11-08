// Linear two-terminal parts: resistor, variable_resistor, wire, switch, bulb.
// All of them stamp a plain conductance. They differ in validation and readouts.

/** Smallest resistance the solver uses. Stands in for "zero ohm" wires and keeps the matrix solvable. */
export const MIN_RESISTANCE = 1e-3;
export const WIRE_RESISTANCE = MIN_RESISTANCE;

function checkResistance(comp) {
  const r = comp.resistance;
  if (typeof r !== 'number' || !Number.isFinite(r) || r < 0) {
    throw new TypeError(`Component "${comp.id}": resistance must be a non-negative number, got ${r}`);
  }
}

function passiveReadout(comp, volts, resistance) {
  const voltage = volts(comp.nodes[0]) - volts(comp.nodes[1]);
  const current = voltage / Math.max(resistance, MIN_RESISTANCE);
  return { current, voltage, power: voltage * current };
}

export const resistor = {
  type: 'resistor',
  validate: checkResistance,
  stamp(ctx, comp) {
    ctx.addConductance(comp.nodes[0], comp.nodes[1], 1 / Math.max(comp.resistance, MIN_RESISTANCE));
  },
  readout(comp, volts) {
    return passiveReadout(comp, volts, comp.resistance);
  },
};

export const variableResistor = {
  ...resistor,
  type: 'variable_resistor',
  validate(comp) {
    checkResistance(comp);
    for (const key of ['min', 'max']) {
      if (key in comp && (typeof comp[key] !== 'number' || !Number.isFinite(comp[key]) || comp[key] < 0)) {
        throw new TypeError(`Component "${comp.id}": ${key} must be a non-negative number`);
      }
    }
  },
};

export const wire = {
  type: 'wire',
  stamp(ctx, comp) {
    ctx.addConductance(comp.nodes[0], comp.nodes[1], 1 / WIRE_RESISTANCE);
  },
  readout(comp, volts) {
    return passiveReadout(comp, volts, WIRE_RESISTANCE);
  },
};

export const switchPart = {
  type: 'switch',
  defaults: { closed: false },
  validate(comp) {
    if (typeof comp.closed !== 'boolean') {
      throw new TypeError(`Component "${comp.id}": closed must be true or false`);
    }
  },
  conducts: (comp) => comp.closed,
  stamp(ctx, comp) {
    if (comp.closed) ctx.addConductance(comp.nodes[0], comp.nodes[1], 1 / WIRE_RESISTANCE);
  },
  readout(comp, volts) {
    if (!comp.closed) return { current: 0, voltage: volts(comp.nodes[0]) - volts(comp.nodes[1]), power: 0 };
    return passiveReadout(comp, volts, WIRE_RESISTANCE);
  },
};

/** Bulb with defaults for a small robot lamp: 20 ohm, 1 W rated (about 4.5 V). */
export const BULB_BURNOUT_FACTOR = 2;
export const BULB_LIT_BRIGHTNESS = 0.1;

export const bulb = {
  type: 'bulb',
  defaults: { resistance: 20, ratedPower: 1 },
  validate(comp) {
    checkResistance(comp);
    if (typeof comp.ratedPower !== 'number' || !(comp.ratedPower > 0)) {
      throw new TypeError(`Component "${comp.id}": ratedPower must be a positive number`);
    }
  },
  stamp: resistor.stamp,
  readout(comp, volts) {
    const base = passiveReadout(comp, volts, comp.resistance);
    const brightness = base.power / comp.ratedPower;
    return { ...base, brightness, lit: brightness >= BULB_LIT_BRIGHTNESS };
  },
  flags(comp, readout) {
    if (readout.power >= BULB_BURNOUT_FACTOR * comp.ratedPower) {
      return [{ type: 'burnt-out', message: 'Bulb is getting far more power than it can take.' }];
    }
    return [];
  },
};
