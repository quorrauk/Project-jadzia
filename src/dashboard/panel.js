// Mission Control panel. Starts empty. Finishing a mission installs one part. Python can only drive parts she has built.
// Pure model first (testable), then a small DOM view.

export const PARTS = [
  { id: 'power', lesson: 'ignition', project: 'Ignition', name: 'Main power switch + pad lamp', blurb: 'Switch the pad on and the lamp lights.' },
  { id: 'headlight', lesson: 'headlights', project: 'Headlights', name: 'Headlight switch + LED', blurb: 'An LED that needs the main power on.' },
  { id: 'dimmer', lesson: 'dimmer', project: 'Dimmer', name: 'Dimmer dial', blurb: 'Turns the headlight down from 100 to 0.' },
  { id: 'backup', lesson: 'switch-panel', project: 'Switch Panel', name: 'Two backup switches', blurb: 'Backup A and Backup B. Each draws power.' },
  { id: 'gauge', lesson: 'power-budget', project: 'Power Budget', name: 'Battery gauge', blurb: 'Shows the draw and how many hours are left.' },
  { id: 'status', lesson: 'mission-day-failure', project: 'Mission Day', name: 'Status display', blurb: 'Tells you when everything is go.' },
];

export const SWITCHES = {
  power: { part: 'power', project: 'Ignition' },
  headlight: { part: 'headlight', project: 'Headlights' },
  backup_a: { part: 'backup', project: 'Switch Panel' },
  backup_b: { part: 'backup', project: 'Switch Panel' },
};

export const BATTERY_MAH = 500;
export const DRAW_MA = { lamp: 50, headlight: 15, backup: 20 };

export const installedParts = (completed = []) => PARTS.filter((p) => completed.includes(p.lesson)).map((p) => p.id);
export const partForLesson = (lessonId) => PARTS.find((p) => p.lesson === lessonId) ?? null;

export const createPanelState = () => ({ switches: { power: false, headlight: false, backup_a: false, backup_b: false }, dim: 100 });

/** Apply the actions a Python run recorded. Anything for a part that is not installed is ignored (Python already refuses it). */
export function applyActions(state, actions, installed) {
  const has = (part) => installed.includes(part);
  for (const a of actions ?? []) {
    if (a.fn === 'dim' && has('dimmer')) state.dim = Math.max(0, Math.min(100, a.value));
    else if ((a.fn === 'on' || a.fn === 'off') && SWITCHES[a.name] && has(SWITCHES[a.name].part)) state.switches[a.name] = a.fn === 'on';
  }
  return state;
}

export function live(state, installed) {
  const has = (p) => installed.includes(p);
  const power = has('power') && state.switches.power;
  const brightness = has('headlight') && power && state.switches.headlight ? (has('dimmer') ? state.dim / 100 : 1) : 0;
  const backups = ['backup_a', 'backup_b'].filter((n) => has('backup') && power && state.switches[n]).length;
  const drawMa = (power ? DRAW_MA.lamp : 0) + DRAW_MA.headlight * brightness + DRAW_MA.backup * backups;
  const hours = drawMa > 0 ? BATTERY_MAH / drawMa : null;
  return { power, padLamp: power, brightness, backups, drawMa, hours, allGo: power && brightness > 0 && backups >= 2 };
}

// ------------------------------------------------------------------ view

function el(tag, attrs = {}, text) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
}

export function mountPanel(container, { installed, state, onChange = () => {}, title = 'Mission Control', fresh = null }) {
  const root = el('section', { class: 'dash', 'data-testid': 'dash', 'aria-label': title });
  const head = el('div', { class: 'dash-head' });
  head.append(el('h2', {}, title), el('span', { class: 'muted', 'data-testid': 'dash-count' }, `${installed.length} of ${PARTS.length} parts built`));
  root.append(head);
  const grid = el('div', { class: 'dash-grid' });
  const refs = {};
  const has = (p) => installed.includes(p);

  const lamp = (id, label) => {
    const wrap = el('div', { class: 'dash-lamp', 'data-testid': `lamp-${id}`, 'data-lit': 'false' });
    wrap.append(el('span', { class: 'bulb', 'aria-hidden': 'true' }), el('span', {}, label));
    return wrap;
  };
  const toggle = (name, label) => {
    const b = el('button', { type: 'button', class: 'dash-switch secondary', 'aria-pressed': 'false', 'data-testid': `sw-${name}` }, `${label}: OFF`);
    b.addEventListener('click', () => { state.switches[name] = !state.switches[name]; update(); onChange(); });
    refs[name] = { b, label };
    return b;
  };
  const card = (id, ...kids) => {
    const part = PARTS.find((p) => p.id === id);
    const c = el('div', { class: 'dash-part', 'data-testid': `dash-${id}`, ...(fresh === id ? { 'data-fresh': 'true' } : {}) });
    c.append(el('h3', {}, part.name), ...kids);
    grid.append(c);
  };

  if (has('power')) { refs.pad = lamp('pad', 'Pad lamp'); card('power', toggle('power', 'Main power'), refs.pad); }
  if (has('headlight')) { refs.head = lamp('headlight', 'Headlight'); card('headlight', toggle('headlight', 'Headlight'), refs.head); }
  if (has('dimmer')) {
    const r = el('input', { type: 'range', min: '0', max: '100', step: '1', 'aria-label': 'Dimmer', 'data-testid': 'dimmer' });
    r.addEventListener('input', () => { state.dim = Number(r.value); update(); onChange(); });
    refs.dim = r;
    refs.dimText = el('span', { 'data-testid': 'dimmer-value' });
    card('dimmer', r, refs.dimText);
  }
  if (has('backup')) card('backup', toggle('backup_a', 'Backup A'), toggle('backup_b', 'Backup B'));
  if (has('gauge')) { refs.gauge = el('p', { class: 'dash-read', 'data-testid': 'gauge' }); card('gauge', refs.gauge); }
  if (has('status')) { refs.status = el('p', { class: 'dash-read', 'data-testid': 'status-display' }); card('status', refs.status); }

  if (installed.length === 0) {
    root.append(el('p', { class: 'muted', 'data-testid': 'dash-empty' }, 'Your panel is empty. Finish a mission and you build your first part.'));
  } else root.append(grid);

  const nextPart = PARTS.find((p) => !has(p.id));
  if (nextPart) root.append(el('p', { class: 'muted dash-next', 'data-testid': 'dash-next' }, `Next part: ${nextPart.name}. Finish ${nextPart.project} to build it.`));

  function update() {
    const s = live(state, installed);
    for (const n of ['power', 'headlight', 'backup_a', 'backup_b']) {
      if (!refs[n]) continue;
      const on = state.switches[n];
      refs[n].b.setAttribute('aria-pressed', String(on));
      refs[n].b.textContent = `${refs[n].label}: ${on ? 'ON' : 'OFF'}`;
    }
    if (refs.pad) refs.pad.dataset.lit = String(s.padLamp);
    if (refs.head) { refs.head.dataset.lit = String(s.brightness > 0); refs.head.style.setProperty('--b', String(s.brightness)); }
    if (refs.dim) { refs.dim.value = String(state.dim); refs.dimText.textContent = `${state.dim}%`; }
    if (refs.gauge) refs.gauge.textContent = s.drawMa > 0 ? `Draw ${Math.round(s.drawMa * 10) / 10} mA · ${Math.round(s.hours * 10) / 10} h left` : 'Draw 0 mA · nothing is on';
    if (refs.status) { refs.status.textContent = s.allGo ? 'ALL SYSTEMS GO' : 'STANDING BY'; refs.status.dataset.go = String(s.allGo); }
  }
  update();
  container.append(root);
  return { update, root };
}
