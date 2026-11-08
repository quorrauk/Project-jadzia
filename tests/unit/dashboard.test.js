import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARTS, installedParts, createPanelState, applyActions, live, partForLesson } from '../../src/dashboard/panel.js';
import lessons from '../../content/lessons.json' with { type: 'json' };

test('empty until she builds it; one part per finished mission', () => {
  assert.deepEqual(installedParts([]), []);
  assert.deepEqual(installedParts(['ignition', 'dimmer', 'ignition:stretch']), ['power', 'dimmer']);
  assert.equal(installedParts(lessons.lessons.map((l) => l.id)).length, PARTS.length);
});

test('every part comes from a real lesson, and every lesson installs a part', () => {
  for (const p of PARTS) assert.ok(lessons.lessons.some((l) => l.id === p.lesson), p.id);
  for (const l of lessons.lessons) assert.ok(partForLesson(l.id), l.id);
});

test('actions only work on installed parts', () => {
  const s = createPanelState();
  applyActions(s, [{ fn: 'on', name: 'power' }, { fn: 'on', name: 'headlight' }, { fn: 'dim', value: 30 }], ['power']);
  assert.equal(s.switches.power, true);
  assert.equal(s.switches.headlight, false);
  assert.equal(s.dim, 100);
});

test('headlight needs main power; dimmer scales it; draw and hours follow', () => {
  const all = PARTS.map((p) => p.id);
  const s = createPanelState();
  s.switches.headlight = true;
  assert.equal(live(s, all).brightness, 0);
  s.switches.power = true;
  s.dim = 50;
  const l = live(s, all);
  assert.equal(l.brightness, 0.5);
  assert.equal(l.drawMa, 57.5);
  assert.equal(Math.round(l.hours * 100), Math.round((500 / 57.5) * 100));
  assert.equal(live(createPanelState(), all).hours, null);
});

test('all systems go needs power, headlight and both backups', () => {
  const all = PARTS.map((p) => p.id);
  const s = createPanelState();
  for (const k of Object.keys(s.switches)) s.switches[k] = true;
  assert.equal(live(s, all).allGo, true);
  s.switches.backup_b = false;
  assert.equal(live(s, all).allGo, false);
});
