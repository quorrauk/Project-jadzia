// Ideal DC voltage source. nodes: [plus, minus].
// Reported current is the current DELIVERED out of the + terminal into the circuit.

/** A real battery cannot supply this much. Beyond it we call the circuit a short circuit. */
export const SHORT_CIRCUIT_CURRENT = 10;

export const battery = {
  type: 'battery',
  validate(comp) {
    if (typeof comp.voltage !== 'number' || !Number.isFinite(comp.voltage)) {
      throw new TypeError(`Component "${comp.id}": voltage must be a number`);
    }
  },
  sourceCount: 1,
  stamp(ctx, comp) {
    ctx.addVoltageSource(comp.id, comp.nodes[0], comp.nodes[1], comp.voltage);
  },
  readout(comp, volts, extra) {
    // MNA gives the current flowing + -> - inside the source; delivered current is the negative of that.
    const current = -extra.sourceCurrent;
    const voltage = volts(comp.nodes[0]) - volts(comp.nodes[1]);
    return { current, voltage, power: voltage * current };
  },
  flags(comp, readout) {
    if (Math.abs(readout.current) > SHORT_CIRCUIT_CURRENT) {
      return [{ type: 'short-circuit', message: 'The battery is connected straight across itself. Far too much current.' }];
    }
    return [];
  },
};
