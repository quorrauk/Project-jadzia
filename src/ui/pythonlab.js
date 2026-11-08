// The Python stage: editor, Run, Reset, hints. Never blocks progress. Her panel sits beside it so panel.on(...) is visible.

import { friendlyError, TIMEOUT_TEXT, LOAD_FAIL_TEXT } from '../python/friendly.js';
import { checkPython } from '../python/checks.js';
import { installedParts, mountPanel, applyActions, SWITCHES, PARTS } from '../dashboard/panel.js';

const el = (tag, attrs = {}, text) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
};

export function drawPythonLab(body, { stage, runner, completed, mentorLine, onRan }) {
  const installed = installedParts(completed);
  const state = { switches: { power: false, headlight: false, backup_a: false, backup_b: false }, dim: 100 };
  body.append(mentorLine(stage.task));

  const editor = el('textarea', { class: 'code-editor', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off', rows: '9', 'aria-label': 'Your Python code', 'data-testid': 'py-editor' });
  editor.value = stage.starter;
  const output = el('pre', { class: 'code py-output', role: 'status', 'data-testid': 'py-output' }, 'Press Run to see what happens.');
  const err = el('p', { class: 'feedback', 'data-state': 'wrong', 'data-testid': 'py-error', hidden: '' });
  const tech = el('details', { hidden: '', 'data-testid': 'py-tech' });
  const verdict = el('p', { class: 'feedback', role: 'status', 'data-testid': 'py-verdict' });
  const hintBox = el('p', { class: 'muted', 'data-testid': 'py-hint' });
  let hints = 0;

  const btn = (label, id, fn, cls = '') => {
    const b = el('button', { type: 'button', 'data-testid': id, ...(cls ? { class: cls } : {}) }, label);
    b.style.marginTop = '0';
    b.addEventListener('click', fn);
    return b;
  };

  const runBtn = btn('Run', 'py-run', run);
  const row = el('div', { class: 'row' });
  row.append(
    runBtn,
    btn('Reset code', 'py-reset', () => { editor.value = stage.starter; }, 'secondary'),
    btn('Give me a hint', 'py-hint-btn', () => { hintBox.textContent = stage.hints[Math.min(hints, stage.hints.length - 1)]; hints += 1; }, 'secondary'),
  );

  async function run() {
    runBtn.disabled = true;
    runBtn.textContent = 'Running…';
    err.hidden = true; tech.hidden = true; verdict.textContent = '';
    const ctx = { installed, switches: SWITCHES, dimmerProject: PARTS.find((p) => p.id === 'dimmer').project, readings: {} };
    const res = await runner.run(editor.value, ctx);
    runBtn.disabled = false;
    runBtn.textContent = 'Run';
    if (!res.ok) {
      output.textContent = '';
      err.textContent = res.reason === 'timeout' ? TIMEOUT_TEXT : LOAD_FAIL_TEXT;
      err.hidden = false;
      return;
    }
    const r = res.result;
    output.textContent = (r.output || (r.error ? '' : '(It ran, and printed nothing.)')) + (r.truncated ? '\n…(cut off)' : '');
    const f = friendlyError(r.error);
    if (f) {
      err.textContent = f.text;
      err.hidden = false;
      tech.replaceChildren(el('summary', {}, 'Show the technical message'), el('p', { class: 'muted' }, f.technical));
      tech.hidden = false;
    }
    applyActions(state, r.actions, installed);
    panel.update();
    const c = checkPython(stage.expect, { code: editor.value, output: r.output, error: r.error, actions: r.actions });
    verdict.dataset.state = c.pass ? 'right' : 'wrong';
    verdict.textContent = c.pass ? 'Yes! That does what the mission asked.' : `Not quite yet. ${c.notes.join('. ')}. You can carry on whenever you like.`;
    onRan(c.pass);
  }

  const lab = el('div', { class: 'py-lab' });
  const left = el('div', { class: 'py-left' });
  left.append(editor, row, output, err, tech, verdict, hintBox);
  const right = el('div', { class: 'py-right' });
  lab.append(left, right);
  body.append(lab);
  const panel = mountPanel(right, { installed, state, title: 'Your panel (try it by hand too)' });
}
