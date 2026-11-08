// SVG drawings for each part. Local coordinates: the part runs along +x from terminal a at (0, 0)
// to terminal b at (LEN, 0). The board rotates the group for vertical parts, and labels are
// counter-rotated so text always reads upright. Pure string output (no DOM) so it is easy to test.
//
// "Draw" lives here, not in the engine plugins, so the solver stays free of any DOM or drawing code.

import { GRID, PART_LENGTH, PART_TYPES } from './model.js';
import { formatVoltage, formatResistance } from './format.js';

export const LEN = GRID * PART_LENGTH; // 160
const MID = LEN / 2;

export const LED_CSS = {
  red: '#ff5d5d',
  orange: '#ffa94d',
  yellow: '#ffe066',
  green: '#5cff9d',
  blue: '#5da8ff',
  white: '#f2f6ff',
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function text(part, x, y, str, cls) {
  const rot = part.rot ? -90 : 0;
  return `<text class="${cls}" x="${x}" y="${y}" text-anchor="middle" transform="rotate(${rot} ${x} ${y})">${esc(str)}</text>`;
}

function rays(cx, cy, from, to, n, color, opacity) {
  let out = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x1 = (cx + Math.cos(a) * from).toFixed(1);
    const y1 = (cy + Math.sin(a) * from).toFixed(1);
    const x2 = (cx + Math.cos(a) * to).toFixed(1);
    const y2 = (cy + Math.sin(a) * to).toFixed(1);
    out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }
  return `<g class="rays" stroke="${color}" opacity="${opacity}">${out}</g>`;
}

function valueLabel(part) {
  if (part.burnt) return 'burnt out';
  const p = part.params;
  switch (part.type) {
    case 'battery': return formatVoltage(p.voltage);
    case 'resistor':
    case 'variable_resistor': return formatResistance(p.resistance);
    case 'led': return p.color;
    case 'switch': return p.closed ? 'closed' : 'open';
    default: return '';
  }
}

function body(part, reading) {
  const lit = !part.burnt && reading.lit;
  const b = Math.max(0.2, Math.min(1, reading.brightness ?? 0));
  switch (part.type) {
    case 'battery':
      return `<path class="lead" d="M0 0H68 M84 0H160"/>
        <line class="plate long" x1="68" y1="-24" x2="68" y2="24"/>
        <line class="plate short" x1="84" y1="-13" x2="84" y2="13"/>
        ${text(part, 52, -12, '+', 'sign')}${text(part, 104, -12, '−', 'sign')}`;

    case 'bulb':
      return `${lit ? `<circle class="glow" cx="${MID}" cy="0" r="50" fill="#ffd24d" opacity="${(0.18 + 0.5 * b).toFixed(2)}"/>${rays(MID, 0, 34, 46, 8, '#ffd24d', 0.9)}` : ''}
        <path class="lead" d="M0 0H54 M106 0H160"/>
        <circle class="body" cx="${MID}" cy="0" r="26"/>
        <path class="filament" d="M56 0 L66 -10 L74 10 L86 -10 L94 10 L104 0"/>`;

    case 'switch':
      return `<path class="lead" d="M0 0H40 M120 0H160"/>
        <circle class="contact" cx="40" cy="0" r="6"/><circle class="contact" cx="120" cy="0" r="6"/>
        ${part.params.closed
          ? '<line class="lever closed" x1="40" y1="0" x2="120" y2="0"/>'
          : '<line class="lever" x1="40" y1="0" x2="112" y2="-32"/>'}`;

    case 'resistor':
      return `<path class="lead" d="M0 0H40 M120 0H160"/><rect class="body" x="40" y="-14" width="80" height="28" rx="3"/>`;

    case 'variable_resistor':
      return `<path class="lead" d="M0 0H40 M120 0H160"/><rect class="body" x="40" y="-14" width="80" height="28" rx="3"/>
        <line class="arrow" x1="52" y1="30" x2="108" y2="-30"/><polygon class="arrowhead" points="110,-34 98,-26 112,-20"/>`;

    case 'led': {
      const c = LED_CSS[part.params.color] ?? LED_CSS.red;
      return `${lit ? `<circle class="glow" cx="${MID}" cy="0" r="46" fill="${c}" opacity="${(0.2 + 0.55 * b).toFixed(2)}"/>${rays(MID, 0, 32, 44, 8, c, 0.9)}` : ''}
        <path class="lead" d="M0 0H56 M104 0H160"/>
        <polygon class="body" points="56,-22 56,22 104,0" style="stroke:${c}"/>
        <line class="bar" x1="104" y1="-22" x2="104" y2="22" style="stroke:${c}"/>
        <path class="ray" d="M80 -28 L92 -40 M92 -24 L104 -36" style="stroke:${c}"/>`;
    }
    default:
      return '';
  }
}

/** Full drawing for a part on the board. `reading` is result.components[id] (may be empty). */
export function glyph(part, reading = {}) {
  let out = body(part, reading);
  if (part.burnt) {
    out += '<g class="burnt-x"><line x1="56" y1="-26" x2="104" y2="26"/><line x1="104" y1="-26" x2="56" y2="26"/></g>';
  }
  out += text(part, MID, part.rot ? -74 : -54, part.id, 'part-id');
  const value = valueLabel(part);
  if (value) out += text(part, MID, part.rot ? 80 : 58, value, 'part-value');
  out += `<rect class="hit" x="30" y="-40" width="100" height="80" fill="transparent"/>`;
  return out;
}

/** Small picture for the palette buttons: no labels, no hit area. */
export function previewSvg(type) {
  const part = { id: '', type, x: 0, y: 0, rot: 0, burnt: false, params: { ...PART_TYPES[type].defaults } };
  return `<svg class="preview circuit" viewBox="-10 -34 180 68" aria-hidden="true" focusable="false">${body(part, {})}</svg>`;
}
