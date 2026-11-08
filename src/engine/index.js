import { registerComponent } from './registry.js';
import { battery } from './components/battery.js';
import { led } from './components/led.js';
import { resistor, variableResistor, wire, switchPart, bulb } from './components/resistive.js';

for (const plugin of [battery, resistor, variableResistor, wire, switchPart, bulb, led]) {
  registerComponent(plugin);
}

export { solve, hasFlag, withResistance } from './solver.js';
export { registerComponent, componentTypes } from './registry.js';
export { LED_FORWARD_VOLTAGE, LED_SERIES_RESISTANCE, LED_MAX_CURRENT } from './components/led.js';
export { SHORT_CIRCUIT_CURRENT } from './components/battery.js';
