import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadPyodide } from 'pyodide';
import { runPython } from '../../src/python/exec.js';
import { friendlyError } from '../../src/python/friendly.js';
import { checkPython } from '../../src/python/checks.js';
import { readFileSync } from 'node:fs';

let py;
before(async () => { py = await loadPyodide(); });

const CTX = {
  installed: ['power', 'dimmer'],
  switches: { power: { part: 'power', project: 'Ignition' }, headlight: { part: 'headlight', project: 'Headlights' } },
  dimmerProject: 'Dimmer',
  readings: { LED1: { current: 0.0148, voltage: 2.03, power: 0.03 }, B1: { current: 0.0148, voltage: 9, power: 0.133 } },
};
const run = (code, ctx = CTX) => runPython(py, code, ctx);

test('print is captured, and a clean run has no error', async () => {
  const r = await run('print("Hello")\nprint(2 + 3)');
  assert.equal(r.output, 'Hello\n5\n');
  assert.equal(r.error, null);
});

test('variables and maths work, f-strings too', async () => {
  const r = await run('v = 9\nr = 470\ni = (v - 2) / r\nprint(f"{i * 1000:.1f} mA")');
  assert.equal(r.output.trim(), '14.9 mA');
});

test('each run starts clean: nothing leaks between runs', async () => {
  await run('secret = 42');
  const r = await run('print(secret)');
  assert.equal(r.error.type, 'NameError');
});

test('errors come back as data with a line number, not as a crash', async () => {
  const r = await run('x = 1\nprint(y)');
  assert.equal(r.error.type, 'NameError');
  assert.equal(r.error.line, 2);
  const z = await run('print(1 / 0)');
  assert.equal(z.error.type, 'ZeroDivisionError');
});

test('syntax errors report the line', async () => {
  const r = await run('print("hi"\nx = 2');
  assert.equal(r.error.type, 'SyntaxError');
  assert.ok(r.error.line >= 1);
});

test('output printed before an error is kept', async () => {
  const r = await run('print("before")\nprint(nope)');
  assert.match(r.output, /before/);
  assert.equal(r.error.type, 'NameError');
});

test('long output is cut off', async () => {
  const r = await run('print("x" * 20000)');
  assert.equal(r.truncated, true);
  assert.equal(r.output.length, 5000);
});

test('input() explains itself instead of hanging', async () => {
  const r = await run('name = input("Name? ")');
  assert.equal(r.error.type, 'PanelError');
  assert.match(r.error.message, /input\(\)/);
});

test('panel: installed switches record actions; dim needs the dimmer', async () => {
  const r = await run('panel.on("power")\npanel.dim(40)');
  assert.deepEqual(r.actions, [{ fn: 'on', name: 'power' }, { fn: 'dim', value: 40 }]);
  assert.equal(r.error, null);
});

test('panel: a part she has not installed gives a friendly nudge to the mission', async () => {
  const r = await run('panel.on("headlight")');
  assert.equal(r.error.type, 'PanelError');
  assert.match(r.error.message, /not installed yet.*Headlights/);
  const d = await run('panel.dim(10)', { ...CTX, installed: ['power'] });
  assert.match(d.error.message, /dimmer is not installed.*Dimmer/);
});

test('panel: unknown names list what is available; an empty panel says so', async () => {
  const r = await run('panel.on("warp")');
  assert.match(r.error.message, /no switch called 'warp'.*power/);
  const e = await run('panel.on("power")', { ...CTX, installed: [] });
  assert.match(e.error.message, /not installed yet|empty/);
  const nothing = await run('panel.on("warp")', { ...CTX, installed: [] });
  assert.match(nothing.error.message, /panel is empty/);
});

test('panel.dim only takes 0 to 100', async () => {
  const r = await run('panel.dim(150)');
  assert.match(r.error.message, /0 to 100/);
});

test('circuit: reads her workshop board, and names the parts when she asks for one that is not there', async () => {
  const r = await run('print(circuit.current("LED1") * 1000)\nprint(circuit.parts())');
  assert.match(r.output, /14\.8/);
  assert.match(r.output, /\['B1', 'LED1'\]/);
  const bad = await run('circuit.current("LED9")');
  assert.match(bad.error.message, /no part called 'LED9'.*B1, LED1/);
});

test('friendly errors: plain words, line numbers, and the technical message kept', () => {
  const f = friendlyError({ type: 'NameError', message: "name 'volts' is not defined", line: 3 });
  assert.match(f.text, /^On line 3: Python does not know the name "volts"/);
  assert.equal(f.technical, "NameError: name 'volts' is not defined");
  assert.match(friendlyError({ type: 'ZeroDivisionError', message: 'division by zero', line: 1 }).text, /divided by zero/);
  assert.match(friendlyError({ type: 'TypeError', message: "can only concatenate str (not \"int\") to str", line: 2 }).text, /words and numbers/);
  assert.match(friendlyError({ type: 'SyntaxError', message: "'(' was never closed", line: 1 }).text, /bracket/);
  assert.match(friendlyError({ type: 'SyntaxError', message: 'unterminated string literal (detected at line 1)', line: 1 }).text, /quote/);
  assert.equal(friendlyError({ type: 'PanelError', message: 'Your panel is empty.', line: 1 }).text, 'On line 1: Your panel is empty.');
  assert.match(friendlyError({ type: 'WeirdError', message: 'x', line: null }).text, /went wrong/);
  assert.equal(friendlyError(null), null);
});

test('real Python errors map to the friendly text', async () => {
  for (const [code, re] of [
    ['print(oops)', /does not know the name/],
    ['print("a" + 1)', /words and numbers/],
    ['print(1/0)', /divided by zero/],
    ['print("hi"', /bracket/],
    ['if True\n  pass', /colon/],
  ]) {
    const r = await run(code);
    assert.match(friendlyError(r.error).text, re, code);
  }
});

test('checks: each rule type', () => {
  const ok = { code: 'print( "Hi" )\npanel.on("power")', output: 'Hi\n', error: null, actions: [{ fn: 'on', name: 'power' }] };
  assert.equal(checkPython([{ kind: 'code-contains', text: 'print(' }, { kind: 'any-output' }, { kind: 'output-contains', text: 'Hi' }, { kind: 'panel', fn: 'on', name: 'power' }], ok).pass, true);
  const miss = checkPython([{ kind: 'code-contains', text: 'f"' }, { kind: 'output-contains', text: '14.89' }, { kind: 'panel', fn: 'dim' }], ok);
  assert.equal(miss.pass, false);
  assert.equal(miss.notes.length, 3);
  assert.equal(checkPython([{ kind: 'any-output' }], { code: '', output: '', error: null }).pass, false);
  assert.equal(checkPython([{ kind: 'any-output' }], { ...ok, error: { type: 'X' } }).pass, false);
  assert.throws(() => checkPython([{ kind: 'nope' }], ok));
});

test('every Python stage in the lessons: its starter code runs and meets its own rules (except the debug one, which must fail)', async () => {
  const index = JSON.parse(readFileSync(new URL('../../content/lessons.json', import.meta.url)));
  const ctx = { ...CTX, installed: ['power', 'headlight', 'dimmer', 'backup', 'gauge', 'status'], switches: {
    power: { part: 'power', project: 'Ignition' }, headlight: { part: 'headlight', project: 'Headlights' },
    backup_a: { part: 'backup', project: 'Switch Panel' }, backup_b: { part: 'backup', project: 'Switch Panel' } } };
  let seen = 0;
  for (const entry of index.lessons) {
    const def = JSON.parse(readFileSync(new URL(`../../content/${entry.file}`, import.meta.url)));
    for (const st of def.stages.filter((s) => s.type === 'python')) {
      seen += 1;
      const r = await runPython(py, st.starter, ctx);
      assert.equal(r.error, null, `${entry.id}: starter code should run: ${JSON.stringify(r.error)}`);
      const c = checkPython(st.expect, { code: st.starter, output: r.output, error: r.error, actions: r.actions });
      if (entry.id === 'mission-day-failure') assert.equal(c.pass, false, 'the debug task must start broken');
      else assert.equal(c.pass, true, `${entry.id}: starter should meet the rules: ${c.notes.join('; ')}`);
    }
  }
  assert.equal(seen, 6);
});
