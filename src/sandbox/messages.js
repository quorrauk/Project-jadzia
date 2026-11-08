// Friendly status line for the workshop. Plain words for a 13-year-old, a bit cheeky.
// Returns { tone: 'info' | 'good' | 'warn' | 'bad', text }.

import { hasFlag } from '../engine/index.js';
import { formatCurrent } from './format.js';

const FLOWING = 1e-6; // amps

function burntHint(board, ids) {
  const part = board.parts.find((p) => p.id === ids[0]);
  if (part && part.type === 'bulb') return 'It got far more power than it can take. Try a lower-voltage battery, then repair it.';
  return 'Too much current went through it. Try adding a resistor to hold the current back, then repair it.';
}

export function statusFor({ board, result, justBurnt }) {
  const batteries = board.parts.filter((p) => p.type === 'battery' && !p.burnt);

  if (justBurnt.length > 0) {
    return { tone: 'bad', text: `Pop! ${justBurnt.join(' and ')} just retired early. ${burntHint(board, justBurnt)}` };
  }

  if (batteries.length === 0 && board.parts.length === 0) {
    return { tone: 'info', text: "Start with a battery. It's your robot's power supply." };
  }

  const shorted = result.flags.filter((f) => f.type === 'short-circuit');
  if (shorted.length >= 2) {
    return { tone: 'bad', text: 'Your batteries are pushing against each other with nothing in between. Join + to − to chain them, not + to +.' };
  }
  if (hasFlag(result, 'short-circuit')) {
    return { tone: 'bad', text: 'Short circuit! Your battery is joined straight to itself with only wire. Take that wire out.' };
  }

  if (!result.ok) {
    return { tone: 'warn', text: "I can't work out this circuit. Try taking something out and building it back up." };
  }

  const burnt = board.parts.filter((p) => p.burnt);
  if (burnt.length > 0) {
    const names = burnt.map((p) => p.id).join(' and ');
    return { tone: 'warn', text: `${names} ${burnt.length > 1 ? 'are' : 'is'} burnt out. Tap it, then tap Repair to fix it.` };
  }

  if (batteries.length === 0) {
    return { tone: 'info', text: 'Add a battery. Nothing can flow without one.' };
  }

  const flow = Math.max(0, ...batteries.map((b) => Math.abs(result.components[b.id]?.current ?? 0)));
  if (flow < FLOWING) {
    if (board.parts.some((p) => p.type === 'switch' && !p.params.closed)) {
      return { tone: 'info', text: 'Nothing is flowing yet. A switch is open. Tap it to close the gap.' };
    }
    return { tone: 'info', text: "Nothing is flowing yet. Electricity needs a full loop from the battery's + all the way round to its −." };
  }

  const lit = Object.values(result.components).filter((c) => c.lit).length;
  const amount = formatCurrent(flow);
  if (lit > 0) {
    return { tone: 'good', text: `Lights on! ${lit} glowing. ${amount} is flowing from the battery.` };
  }
  return { tone: 'good', text: `Electricity is flowing: ${amount} from the battery.` };
}
