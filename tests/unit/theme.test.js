import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { THEMES, DEFAULT_THEME, isTheme, loadDeviceTheme, saveDeviceTheme, applyTheme } from '../../src/ui/theme.js';
import { createStore } from '../../src/progress/store.js';

const mem = () => { const d = {}; return { getItem: (k) => d[k] ?? null, setItem: (k, v) => { d[k] = v; } }; };

test('four themes, NASA first and default', () => {
  assert.deepEqual(THEMES.map((t) => t.name), ['NASA', 'Light', 'T2', 'Quantum Leap']);
  assert.equal(DEFAULT_THEME, 'nasa');
  assert.equal(isTheme('t2'), true);
  assert.equal(isTheme('pink'), false);
});

test('device theme: remembered, defaults when missing, junk or storage throws', () => {
  const s = mem();
  assert.equal(loadDeviceTheme(s), 'nasa');
  saveDeviceTheme(s, 'light');
  assert.equal(loadDeviceTheme(s), 'light');
  s.setItem('jadzia.theme', 'bogus');
  assert.equal(loadDeviceTheme(s), 'nasa');
  const bad = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(loadDeviceTheme(bad), 'nasa');
  assert.doesNotThrow(() => saveDeviceTheme(bad, 'light'));
});

test('applyTheme sets the body attribute and falls back to the default', () => {
  const doc = { body: { dataset: {} } };
  applyTheme(doc, 'quantum-leap');
  assert.equal(doc.body.dataset.theme, 'quantum-leap');
  applyTheme(doc, 'nope');
  assert.equal(doc.body.dataset.theme, 'nasa');
});

test('a profile keeps its own theme', () => {
  const store = createStore(mem(), 'Prog', () => 0.5);
  const p = store.createProfile({ name: 'Ada', robotName: 'Rover' });
  store.updateProfile(p.id, { theme: 't2' });
  assert.equal(store.getActive().theme, 't2');
});

test('every theme defines every colour variable, and animation only respects reduced motion', () => {
  const root = readFileSync(new URL('../../src/ui/styles.css', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../src/ui/themes.css', import.meta.url), 'utf8');
  const vars = [...root.slice(0, root.indexOf('* { box-sizing')).matchAll(/--([a-z-]+):/g)].map((m) => m[1]).filter((v) => !['font', 'glow-shadow', 'halo', 'tint'].includes(v));
  for (const t of THEMES) {
    const block = css.match(new RegExp(`body\\[data-theme="${t.id}"\\] \\{([^}]*)\\}`))?.[1] ?? '';
    for (const v of vars) assert.match(block, new RegExp(`--${v}:`), `${t.id} is missing --${v}`);
  }
  for (const m of css.matchAll(/animation:/g)) {
    const before = css.slice(0, m.index);
    const lastMq = before.lastIndexOf('@media (prefers-reduced-motion: no-preference)');
    const lastClose = before.lastIndexOf('\n}\n');
    assert.ok(lastMq > lastClose, 'an animation is outside the reduced-motion media query');
  }
});
