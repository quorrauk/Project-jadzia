// The workshop: an SVG circuit board you can build on with a finger or a mouse.
//   - tap a part in the list, then tap the board (or drag it from the list)
//   - tap a dot, then another dot (or drag between dots) to run a wire
//   - tap a part to select it: move, turn, delete, change values; tap a switch to flip it
// Everything that is not DOM lives in model.js / messages.js / readouts.js and is unit tested.

import {
  GRID, COLS, ROWS, PART_LENGTH, PART_TYPES,
  createBoard, addPart, movePart, rotatePart, removePart, addWire, removeWire, setParam,
  repairPart, clearBoard, terminalPoint, wirePath, canPlace, evaluate, starterBoard, partLabel,
} from './model.js';
import { glyph, previewSvg, LED_CSS } from './glyphs.js';
import { statusFor } from './messages.js';
import { readoutLines } from './readouts.js';
import { formatVoltage, formatResistance } from './format.js';
import { LEVELS } from '../progress/levels.js';

const CHIPS = {
  voltage: [1.5, 3, 4.5, 6, 9, 12],
  resistance: [100, 220, 330, 470, 1000, 2200, 4700, 10000],
};

const NOTICE = {
  taken: 'That spot is taken. Try somewhere else.',
  outside: "That's off the board.",
  duplicate: 'Those two dots are already joined.',
  'same-terminal': 'Pick a different dot to finish the wire.',
  'unknown-terminal': "I couldn't find that dot.",
  invalid: "I couldn't put it there.",
};

const MOVE_THRESHOLD = 6; // px before a press becomes a drag

function loadBoard(raw) {
  try {
    if (raw && Array.isArray(raw.parts) && Array.isArray(raw.wires) && raw.counters && typeof raw.counters === 'object') {
      const copy = JSON.parse(JSON.stringify(raw));
      if (copy.parts.every((p) => PART_TYPES[p.type] && p.params)) return copy;
    }
  } catch {
    /* fall through to a fresh board */
  }
  return createBoard();
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const snap = (v) => Math.round(v / GRID);

function template(allowedParts, embedded) {
  const palette = Object.keys(PART_TYPES)
    .filter((t) => !allowedParts || allowedParts.includes(t))
    .map((t) => `<button type="button" class="palette-item" data-type="${t}" data-testid="palette-${t}" aria-pressed="false">
        <span class="pv">${previewSvg(t)}</span><span>${PART_TYPES[t].label}</span></button>`)
    .join('');
  const levels = LEVELS.map((l) => `<option value="${l.id}">Level ${l.id} · ${l.name}</option>`).join('');
  return `
  <section class="workshop" data-testid="workshop">
    <header class="ws-top">
      ${embedded ? '' : '<button type="button" class="secondary" data-testid="ws-back">← Base</button>'}
      <h1>${embedded ? 'Build it here' : 'Workshop'}</h1>
      <label class="ws-level"><span class="sr-only">Level</span>
        <select data-testid="ws-level-select">${levels}</select></label>
      <button type="button" class="secondary" data-testid="btn-help">I don't get it</button>
    </header>
    <p class="ws-status" data-testid="status-text" role="status" aria-live="polite"></p>
    <div class="ws-help" data-testid="help" hidden>
      <h2>How the workshop works</h2>
      <ol>
        <li><strong>Put parts down.</strong> Tap a part in the list, then tap the board.</li>
        <li><strong>Join them with wire.</strong> Tap a dot on one part, then a dot on another. Or drag from one dot to the other.</li>
        <li><strong>Make a loop.</strong> Electricity only flows in a full circle: out of the battery's +, through your parts, and back to its −.</li>
        <li><strong>Tap a part</strong> to see what's going on inside it. You can turn it, change it or delete it.</li>
      </ol>
      <p>Parts pop if you give them too much. That's fine, it's how you learn. Tap Repair and have another go.</p>
      <div class="row">
        <button type="button" data-testid="help-starter">Show me a working circuit</button>
        <button type="button" class="secondary" data-testid="help-close">Got it</button>
      </div>
    </div>
    <div class="ws-main">
      <div class="ws-boardwrap">
        <svg class="board circuit" data-testid="board" viewBox="-20 -20 ${COLS * GRID + 40} ${ROWS * GRID + 40}" role="img"
          aria-label="Circuit board. Parts and wires are listed in the panel."></svg>
      </div>
      <aside class="ws-side">
        <div class="ws-palette" data-testid="palette" role="group" aria-label="Parts">${palette}</div>
        <div class="ws-props" data-testid="props"></div>
        <div class="ws-readout" data-testid="readout" aria-live="polite"></div>
        <div class="row ws-actions">
          <button type="button" class="secondary" data-testid="btn-starter">Load a starter circuit</button>
          <button type="button" class="secondary" data-testid="btn-clear">Clear board</button>
        </div>
      </aside>
    </div>
  </section>`;
}

export function mountWorkshop(container, { profile, onSave, onExit, onLevelChange, embedded = false, allowedParts = null }) {
  let level = profile.level;
  let board = loadBoard(profile.workshop);
  const ui = {
    armed: null, // part type waiting to be placed
    selected: null, // { kind: 'part' | 'wire', id }
    pendingWire: null, // terminal id, for tap-tap wiring
    drag: null, // active pointer drag on the board
    paletteDrag: null,
    cursor: null, // board px, while dragging a wire
    hover: null, // terminal under a dragged wire
    notice: null, // { text, tone, until }
    pop: null, // the "Pop!" message, kept visible for a few seconds
    confirm: null, // 'starter' | 'clear'
  };
  let last = null;
  const timers = new Set();

  container.innerHTML = template(allowedParts, embedded);
  const $ = (id) => container.querySelector(`[data-testid="${id}"]`);
  const svg = $('board');
  const statusEl = $('status-text');
  const propsEl = $('props');
  const readoutEl = $('readout');
  const paletteEl = $('palette');
  const helpEl = $('help');
  const levelSelect = $('ws-level-select');
  levelSelect.value = String(level);

  // ---------------------------------------------------------------- helpers

  const save = () => onSave(board);

  function later(fn, ms) {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  }

  function notify(text, tone = 'warn', ms = 3000) {
    ui.notice = { text, tone, until: Date.now() + ms };
    later(() => render({ props: false }), ms + 50);
  }

  function toBoardPoint(e) {
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  function terminalAt(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY);
    const t = el && el.closest ? el.closest('[data-terminal]') : null;
    return t ? t.dataset.terminal : null;
  }

  function firstBatteryId() {
    const b = board.parts.find((p) => p.type === 'battery' && !p.burnt);
    return b ? b.id : null;
  }

  // ---------------------------------------------------------------- actions

  function findSpot(type, x, y) {
    for (const dy of [0, -1, 1, -2, 2]) {
      for (const dx of [0, 1, -1, 2, -2, 3, -3]) {
        const tx = clamp(x + dx, 0, COLS - PART_LENGTH);
        const ty = clamp(y + dy, 0, ROWS);
        if (canPlace(board, tx, ty, 0).ok) return { x: tx, y: ty };
      }
    }
    return null;
  }

  function place(type, point) {
    const wantX = clamp(snap(point.x) - PART_LENGTH / 2, 0, COLS - PART_LENGTH);
    const wantY = clamp(snap(point.y), 0, ROWS);
    const spot = findSpot(type, wantX, wantY);
    if (!spot) {
      notify(NOTICE.taken);
      return render();
    }
    const res = addPart(board, type, spot.x, spot.y);
    if (!res.ok) {
      notify(NOTICE[res.reason] ?? NOTICE.invalid);
      return render();
    }
    ui.selected = { kind: 'part', id: res.part.id };
    ui.armed = null;
    save();
    return render();
  }

  function connect(from, to) {
    const res = addWire(board, from, to);
    ui.pendingWire = null;
    if (!res.ok) notify(NOTICE[res.reason] ?? NOTICE.invalid);
    else save();
    render();
  }

  function deleteSelected() {
    if (!ui.selected) return;
    if (ui.selected.kind === 'part') removePart(board, ui.selected.id);
    else removeWire(board, ui.selected.id);
    ui.selected = null;
    save();
    render();
  }

  function rotateSelected() {
    if (ui.selected?.kind !== 'part') return;
    const res = rotatePart(board, ui.selected.id);
    if (!res.ok) notify(NOTICE[res.reason] ?? NOTICE.invalid);
    else save();
    render();
  }

  function replaceBoard(next) {
    board = next;
    ui.selected = null;
    ui.pendingWire = null;
    ui.armed = null;
    ui.confirm = null;
    ui.pop = null;
    save();
    render();
  }

  function askThen(key, run) {
    if (board.parts.length === 0 || ui.confirm === key) {
      ui.confirm = null;
      run();
      return;
    }
    ui.confirm = key;
    later(() => {
      if (ui.confirm === key) {
        ui.confirm = null;
        render({ props: false });
      }
    }, 4000);
    render({ props: false });
  }

  const loadStarter = () => replaceBoard(starterBoard());
  const clearAll = () => {
    const fresh = createBoard();
    clearBoard(fresh);
    replaceBoard(fresh);
  };

  // ---------------------------------------------------------------- pointer handling (board)

  function onDown(e) {
    if (e.button > 0) return;
    ui.confirm = null;
    const terminal = e.target.closest('[data-terminal]');
    if (terminal) {
      const id = terminal.dataset.terminal;
      if (ui.pendingWire && ui.pendingWire !== id) {
        connect(ui.pendingWire, id);
        return;
      }
      ui.drag = { kind: 'wire', from: id, startX: e.clientX, startY: e.clientY, moved: false };
      try { svg.setPointerCapture(e.pointerId); } catch { /* not fatal */ }
      return;
    }
    // A part is waiting to be put down: a tap anywhere but on a dot places it (finding a free spot nearby).
    if (ui.armed) {
      place(ui.armed, toBoardPoint(e));
      return;
    }
    const partEl = e.target.closest('[data-part]');
    if (partEl) {
      const part = board.parts.find((p) => p.id === partEl.dataset.part);
      const p = toBoardPoint(e);
      ui.selected = { kind: 'part', id: part.id };
      ui.pendingWire = null;
      ui.drag = {
        kind: 'part',
        id: part.id,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        origin: { x: part.x, y: part.y },
        grab: { dx: snap(p.x) - part.x, dy: snap(p.y) - part.y },
      };
      try { svg.setPointerCapture(e.pointerId); } catch { /* not fatal */ }
      render();
      return;
    }
    const wireEl = e.target.closest('[data-wire]');
    if (wireEl) {
      ui.selected = { kind: 'wire', id: wireEl.dataset.wire };
      ui.pendingWire = null;
      render();
      return;
    }
    // Empty board space.
    if (ui.armed) {
      place(ui.armed, toBoardPoint(e));
      return;
    }
    ui.selected = null;
    ui.pendingWire = null;
    render();
  }

  function onMove(e) {
    const d = ui.drag;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > MOVE_THRESHOLD) d.moved = true;
    if (!d.moved) return;
    if (d.kind === 'wire') {
      ui.cursor = toBoardPoint(e);
      ui.hover = terminalAt(e.clientX, e.clientY);
      render({ props: false });
      return;
    }
    const p = toBoardPoint(e);
    const tx = snap(p.x) - d.grab.dx;
    const ty = snap(p.y) - d.grab.dy;
    const part = board.parts.find((x) => x.id === d.id);
    if (tx === part.x && ty === part.y) return;
    const res = movePart(board, d.id, tx, ty);
    if (!res.ok) notify(NOTICE[res.reason] ?? NOTICE.invalid, 'warn', 1200);
    render({ props: false });
  }

  function endDrag(e, cancelled) {
    const d = ui.drag;
    if (!d) return;
    ui.drag = null;
    ui.cursor = null;
    ui.hover = null;
    try { svg.releasePointerCapture(e.pointerId); } catch { /* not fatal */ }

    if (d.kind === 'wire') {
      if (cancelled) return render();
      if (d.moved) {
        const target = terminalAt(e.clientX, e.clientY);
        if (target && target !== d.from) return connect(d.from, target);
        return render();
      }
      // A tap on a dot: start (or cancel) a wire.
      ui.pendingWire = ui.pendingWire === d.from ? null : d.from;
      ui.selected = null;
      return render();
    }

    const part = board.parts.find((p) => p.id === d.id);
    if (cancelled && part) {
      part.x = d.origin.x;
      part.y = d.origin.y;
      return render();
    }
    if (!d.moved && part && part.type === 'switch') setParam(board, part.id, 'closed', !part.params.closed);
    save();
    return render();
  }

  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', (e) => endDrag(e, false));
  svg.addEventListener('pointercancel', (e) => endDrag(e, true));
  svg.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------------------------------------------------------------- palette (tap, or drag onto the board)

  paletteEl.addEventListener('pointerdown', (e) => {
    const item = e.target.closest('.palette-item');
    if (!item) return;
    ui.paletteDrag = { type: item.dataset.type, x: e.clientX, y: e.clientY, moved: false };
  });

  const onWindowMove = (e) => {
    const d = ui.paletteDrag;
    if (d && !d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) d.moved = true;
  };

  const onWindowUp = (e) => {
    const d = ui.paletteDrag;
    ui.paletteDrag = null;
    if (!d || !d.moved) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (el && svg.contains(el)) place(d.type, toBoardPoint(e));
  };

  window.addEventListener('pointermove', onWindowMove);
  window.addEventListener('pointerup', onWindowUp);

  paletteEl.addEventListener('click', (e) => {
    const item = e.target.closest('.palette-item');
    if (!item) return;
    const type = item.dataset.type;
    ui.armed = ui.armed === type ? null : type;
    ui.pendingWire = null;
    render({ props: false });
  });

  // ---------------------------------------------------------------- panels

  propsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, key, value } = btn.dataset;
    if (action === 'rotate') return rotateSelected();
    if (action === 'delete') return deleteSelected();
    if (action === 'repair' && ui.selected) {
      repairPart(board, ui.selected.id);
      ui.pop = null;
      save();
      return render();
    }
    if (action === 'toggle' && ui.selected) {
      const part = board.parts.find((p) => p.id === ui.selected.id);
      setParam(board, part.id, 'closed', !part.params.closed);
      save();
      return render();
    }
    if (action === 'set' && ui.selected) {
      const parsed = key === 'color' ? value : Number(value);
      setParam(board, ui.selected.id, key, parsed);
      save();
      return render();
    }
    return undefined;
  });

  propsEl.addEventListener('input', (e) => {
    if (e.target.dataset.testid !== 'vr-slider' || ui.selected?.kind !== 'part') return;
    setParam(board, ui.selected.id, 'resistance', Number(e.target.value));
    const label = propsEl.querySelector('[data-testid="vr-value"]');
    if (label) label.textContent = formatResistance(Number(e.target.value));
    render({ props: false }); // keep the slider in the DOM so the drag continues
  });
  propsEl.addEventListener('change', (e) => {
    if (e.target.dataset.testid === 'vr-slider') save();
  });

  $('btn-help').addEventListener('click', () => {
    helpEl.hidden = !helpEl.hidden;
  });
  $('help-close').addEventListener('click', () => {
    helpEl.hidden = true;
  });
  $('help-starter').addEventListener('click', () => askThen('starter', () => {
    loadStarter();
    helpEl.hidden = true;
  }));
  $('btn-starter').addEventListener('click', () => askThen('starter', loadStarter));
  $('btn-clear').addEventListener('click', () => askThen('clear', clearAll));
  if (!embedded) $('ws-back').addEventListener('click', () => onExit());
  levelSelect.addEventListener('change', () => {
    level = Number(levelSelect.value);
    onLevelChange(level);
    render({ props: false });
  });

  const onKey = (e) => {
    if (/^(input|select|textarea)$/i.test(e.target.tagName)) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteSelected();
    } else if (e.key === 'r' || e.key === 'R') rotateSelected();
    else if (e.key === 'Escape') {
      ui.armed = null;
      ui.pendingWire = null;
      ui.selected = null;
      render();
    }
  };
  document.addEventListener('keydown', onKey);

  // ---------------------------------------------------------------- drawing

  function boardMarkup(ev) {
    const readings = ev.result.components;
    const w = COLS * GRID;
    const h = ROWS * GRID;
    let s = `<defs><pattern id="dots" width="${GRID}" height="${GRID}" patternUnits="userSpaceOnUse">
      ${[[0, 0], [GRID, 0], [0, GRID], [GRID, GRID]].map(([x, y]) => `<circle class="dot" cx="${x}" cy="${y}" r="2.4"/>`).join('')}
      </pattern></defs>
      <rect x="-20" y="-20" width="${w + 40}" height="${h + 40}" fill="url(#dots)"/>
      <rect class="board-edge" x="0" y="0" width="${w}" height="${h}" rx="6"/>`;

    if (board.parts.length === 0) {
      s += `<text class="empty-hint" x="${w / 2}" y="${h / 2 - 8}" text-anchor="middle">Tap a part, then tap here to put it down.</text>
        <text class="empty-hint small" x="${w / 2}" y="${h / 2 + 24}" text-anchor="middle">Stuck? Press "I don't get it".</text>`;
    }

    for (const wire of board.wires) {
      const a = terminalPoint(board, wire.from);
      const b = terminalPoint(board, wire.to);
      const d = `M${wirePath(a, b).map(([x, y]) => `${x * GRID} ${y * GRID}`).join(' L')}`;
      const current = readings[wire.id]?.current ?? 0;
      const cls = ['wire', Math.abs(current) > 1e-6 ? 'flow' : '', current < 0 ? 'rev' : '',
        ui.selected?.kind === 'wire' && ui.selected.id === wire.id ? 'selected' : ''].filter(Boolean).join(' ');
      s += `<g data-wire="${wire.id}" data-testid="wire-${wire.id}"><path class="wire-hit" d="${d}"/><path class="${cls}" d="${d}"/></g>`;
    }

    for (const part of board.parts) {
      const selected = ui.selected?.kind === 'part' && ui.selected.id === part.id;
      const reading = readings[part.id] ?? {};
      const lit = !part.burnt && !!reading.lit;
      s += `<g class="part ${selected ? 'selected' : ''} ${part.burnt ? 'burnt' : ''}" data-part="${part.id}"
        data-testid="part-${part.id}" data-lit="${lit}" data-burnt="${part.burnt}"
        transform="translate(${part.x * GRID} ${part.y * GRID}) rotate(${part.rot * 90})">
        ${selected ? '<rect class="sel-box" x="-22" y="-92" width="204" height="184" rx="12"/>' : ''}${glyph(part, reading)}</g>`;
    }

    if (ui.drag?.kind === 'wire' && ui.drag.moved && ui.cursor) {
      const a = terminalPoint(board, ui.drag.from);
      s += `<line class="ghost" x1="${a.x * GRID}" y1="${a.y * GRID}" x2="${ui.cursor.x}" y2="${ui.cursor.y}"/>`;
    }

    for (const part of board.parts) {
      for (const end of ['a', 'b']) {
        const id = `${part.id}.${end}`;
        const p = terminalPoint(board, id);
        const cls = ['terminal', ui.pendingWire === id || ui.drag?.from === id ? 'pending' : '', ui.hover === id ? 'hover' : ''].filter(Boolean).join(' ');
        s += `<g class="${cls}" data-terminal="${id}" data-testid="terminal-${id}" transform="translate(${p.x * GRID} ${p.y * GRID})">
          <circle class="t-hit" r="30" fill="transparent"/><circle class="t-dot" r="7"/></g>`;
      }
    }
    return s;
  }

  function propsMarkup() {
    const sel = ui.selected;
    if (!sel) return '<p class="muted">Tap a part or a wire to see what is going on inside it.</p>';
    if (sel.kind === 'wire') {
      return `<strong>Wire ${sel.id}</strong>
        <div class="row"><button type="button" class="secondary" data-action="delete" data-testid="btn-delete">Delete wire</button></div>`;
    }
    const part = board.parts.find((p) => p.id === sel.id);
    if (!part) return '';
    const chip = (key, value, label, active, extra = '') =>
      `<button type="button" class="chip" aria-pressed="${active}" data-action="set" data-key="${key}" data-value="${value}"
        data-testid="chip-${key}-${value}">${extra}${label}</button>`;
    let controls = '';
    if (part.type === 'battery') {
      controls = `<div class="chips" role="group" aria-label="Battery voltage">${CHIPS.voltage.map((v) => chip('voltage', v, formatVoltage(v), part.params.voltage === v)).join('')}</div>`;
    } else if (part.type === 'resistor') {
      controls = `<div class="chips" role="group" aria-label="Resistance">${CHIPS.resistance.map((r) => chip('resistance', r, formatResistance(r), part.params.resistance === r)).join('')}</div>`;
    } else if (part.type === 'variable_resistor') {
      controls = `<label class="slider">Squeeze: <span data-testid="vr-value">${formatResistance(part.params.resistance)}</span>
        <input type="range" min="${part.params.min}" max="${part.params.max}" step="10" value="${part.params.resistance}" data-testid="vr-slider"></label>`;
    } else if (part.type === 'led') {
      controls = `<div class="chips" role="group" aria-label="Colour">${Object.keys(LED_CSS).map((c) =>
        chip('color', c, c, part.params.color === c, `<span class="swatch" style="background:${LED_CSS[c]}"></span>`)).join('')}</div>`;
    } else if (part.type === 'switch') {
      controls = `<button type="button" data-action="toggle" data-testid="btn-switch">${part.params.closed ? 'Open the switch' : 'Close the switch'}</button>`;
    }
    return `<strong>${partLabel(part)} ${part.id}</strong>
      <p class="muted">${PART_TYPES[part.type].info}</p>${controls}
      <div class="row">
        <button type="button" class="secondary" data-action="rotate" data-testid="btn-rotate">Turn</button>
        <button type="button" class="secondary" data-action="delete" data-testid="btn-delete">Delete</button>
        ${part.burnt ? '<button type="button" data-action="repair" data-testid="btn-repair">Repair</button>' : ''}
      </div>`;
  }

  function readoutMarkup(ev) {
    const id = ui.selected?.kind === 'part' ? ui.selected.id : firstBatteryId();
    if (!id) return '<p class="muted">Put a part down and tap it to read its numbers.</p>';
    const part = board.parts.find((p) => p.id === id);
    const lines = readoutLines({ level, partId: id, board, result: ev.result, netlist: ev.netlist });
    return `<strong>${partLabel(part)} ${id}</strong><ul data-testid="readout-lines">${lines.map((l) => `<li>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</li>`).join('')}</ul>`;
  }

  function currentStatus(ev) {
    const now = Date.now();
    if (ui.notice && now < ui.notice.until) return ui.notice;
    if (ui.pendingWire) return { tone: 'info', text: 'Now tap another dot to finish the wire.' };
    if (ui.armed) return { tone: 'info', text: `Tap the board to put the ${PART_TYPES[ui.armed].label.toLowerCase()} down.` };
    if (ui.pop && now < ui.pop.until) return ui.pop;
    return statusFor({ board, result: ev.result, justBurnt: [] });
  }

  function render({ props = true } = {}) {
    const ev = evaluate(board);
    last = ev;
    if (ev.justBurnt.length > 0) {
      const msg = statusFor({ board, result: ev.result, justBurnt: ev.justBurnt });
      ui.pop = { ...msg, until: Date.now() + 6000 };
      save();
      later(() => render({ props: false }), 6050);
    }
    const status = currentStatus(ev);
    statusEl.textContent = status.text;
    statusEl.dataset.tone = status.tone;
    svg.innerHTML = boardMarkup(ev);
    for (const btn of paletteEl.querySelectorAll('.palette-item')) btn.setAttribute('aria-pressed', String(btn.dataset.type === ui.armed));
    if (props) propsEl.innerHTML = propsMarkup();
    readoutEl.innerHTML = readoutMarkup(ev);
    const starter = $('btn-starter');
    const clear = $('btn-clear');
    starter.textContent = ui.confirm === 'starter' ? 'This replaces your board. Sure?' : 'Load a starter circuit';
    clear.textContent = ui.confirm === 'clear' ? 'Clear everything? Tap again' : 'Clear board';
    levelSelect.value = String(level);
  }

  render();

  return {
    unmount() {
      for (const t of timers) clearTimeout(t);
      timers.clear();
      window.removeEventListener('pointermove', onWindowMove);
      window.removeEventListener('pointerup', onWindowUp);
      document.removeEventListener('keydown', onKey);
      container.replaceChildren();
    },
    /** For tests and debugging only. */
    snapshot: () => ({ board, last }),
  };
}
