// Lesson player and Formula Book screens. Logic lives in src/lessons/engine.js; this file only draws.

import { levelInfo, LEVELS } from '../progress/levels.js';
import {
  resolveStage, linkTerms, helpFor, checkAnswer, checkGoal, tierOffer, recordFinish, starsFor, pickScenario, MAX_RUNG,
} from '../lessons/engine.js';
import { instantiate, hashSeed, fmt } from '../lessons/generate.js';
import { createTracker, outcomeFor } from '../lessons/adaptive.js';
import { boardFromSpec } from '../lessons/boards.js';
import { makeToy } from './toys.js';
import { mountWorkshop } from '../sandbox/sandbox.js';
import { drawPythonLab } from './pythonlab.js';
import { partForLesson } from '../dashboard/panel.js';

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

function btn(label, testid, onClick, cls = 'secondary') {
  const b = el('button', { type: 'button', 'data-testid': testid }, label);
  if (cls) b.className = cls;
  b.style.marginTop = '0';
  b.addEventListener('click', onClick);
  return b;
}

const STAGE_NAMES = {
  briefing: 'Briefing', learn: 'Learn', equation: 'Equation card', example: 'Worked example', try: 'Try one',
  mission: 'Mission', debrief: 'Debrief', python: 'Python', maths: 'Maths check',
};

/** Text with [[term]] markup becomes plain text plus tappable glossary words. */
function richText(tag, text, glossary, onTerm) {
  const node = el(tag);
  for (const seg of linkTerms(text)) {
    if (seg.text) node.append(seg.text);
    else {
      const entry = glossary.find((g) => g.id === seg.term);
      const b = el('button', { type: 'button', class: 'term', 'data-testid': `term-${seg.term}` }, entry ? entry.term : seg.term);
      b.addEventListener('click', () => onTerm(seg.term));
      node.append(b);
    }
  }
  return node;
}

export function definitionFor(entry, level) {
  const have = Object.keys(entry.plain).map(Number).sort((a, b) => a - b);
  const use = have.filter((n) => n <= level).pop() ?? have[0];
  return entry.plain[use];
}

// ------------------------------------------------------------------ the player

export function mountLesson(container, { def, profile, glossary, formulas, onExit, onFormula, onFinish, onLevelChange, onAdaptiveChange, seed, runner = null, completed = [] }) {
  let level = profile.level;
  let auto = profile.adaptive !== false;
  const tracker = createTracker(level);
  let sessionSeed = seed ?? Math.floor(Math.random() * 2 ** 31);
  let replays = Math.floor(sessionSeed % 997);
  let index = 0;
  let rung = 0;
  let helpOpen = false;
  let workshop = null;
  let missionTier = 'standard';
  let missionDone = false;
  let finishedTier = null;
  let attempts = 0;
  let missionHints = 0;
  let termShown = null;
  let pendingLevel = null;
  let note = null; // { text, actions: [{label, testid, run}] }
  const answered = new Set(); // question keys already counted by the tracker

  const root = el('section', { class: 'lesson', 'data-testid': 'lesson' });
  container.replaceChildren(root);
  let helpSlot;
  let termSlot;
  let noteSlot;
  let nextBtn;

  function stopWorkshop() {
    if (workshop) {
      workshop.unmount();
      workshop = null;
    }
  }

  // ---- level handling (manual always wins)

  function setLevelNow(l) {
    level = l;
    pendingLevel = null;
    note = null;
    tracker.setLevel(l);
    onLevelChange(l);
    render();
  }

  function recordOutcome(outcome) {
    const move = tracker.record(outcome);
    if (!move) return;
    const to = levelInfo(move.to);
    const word = move.direction === 'up' ? 'up' : 'down';
    if (auto) {
      pendingLevel = move.to;
      note = {
        text: move.direction === 'up'
          ? `Smooth flying. The next stage moves ${word} to Level ${to.id} · ${to.name}.`
          : `Let's ease off a notch. The next stage moves ${word} to Level ${to.id} · ${to.name}.`,
        actions: [
          { label: 'Keep my level', testid: 'level-undo', run: () => { pendingLevel = null; note = null; tracker.setLevel(level); paintNote(); } },
        ],
      };
    } else {
      note = {
        text: move.direction === 'up' ? `These look easy. Want to try Level ${to.id} · ${to.name}?` : `These look tricky. Want to try Level ${to.id} · ${to.name}?`,
        actions: [
          { label: `Switch to Level ${to.id}`, testid: 'level-suggest', run: () => setLevelNow(move.to) },
          { label: 'No thanks', testid: 'level-dismiss', run: () => { note = null; tracker.setLevel(level); paintNote(); } },
        ],
      };
    }
    paintNote();
  }

  function paintNote() {
    if (!noteSlot) return;
    noteSlot.replaceChildren();
    if (!note) return;
    const box = el('div', { class: 'note', role: 'status', 'data-testid': 'level-note' });
    box.append(el('span', {}, note.text));
    const row = el('div', { class: 'row' });
    for (const a of note.actions) row.append(btn(a.label, a.testid, a.run));
    box.append(row);
    noteSlot.append(box);
  }

  // ---- header, help, glossary

  function header(stage) {
    const bar = el('header', { class: 'ws-top' });
    bar.append(btn('← Base', 'lesson-exit', () => { stopWorkshop(); onExit(); }));
    bar.append(el('h1', {}, def.title));
    const label = el('label', { class: 'ws-level' });
    label.append(el('span', { class: 'sr-only' }, 'Level'));
    const select = el('select', { 'data-testid': 'lesson-level' });
    for (const l of LEVELS) {
      const o = el('option', { value: String(l.id) }, `Level ${l.id} · ${l.name}`);
      if (l.id === level) o.selected = true;
      select.append(o);
    }
    select.addEventListener('change', () => setLevelNow(Number(select.value)));
    label.append(select);
    const autoBtn = el('button', { type: 'button', class: 'secondary autochip', 'aria-pressed': String(auto), 'data-testid': 'auto-toggle', title: 'Auto level moves you up or down as you go. You can always pick a level yourself.' }, auto ? 'Auto level: on' : 'Auto level: off');
    autoBtn.style.marginTop = '0';
    autoBtn.addEventListener('click', () => {
      auto = !auto;
      onAdaptiveChange(auto);
      pendingLevel = null;
      note = null;
      render();
    });
    bar.append(label, autoBtn, btn("I don't get it", 'lesson-help', () => { helpOpen = !helpOpen; if (helpOpen && rung === 0) rung = 1; paintHelp(); }));
    return [bar, el('p', { class: 'eyebrow', 'data-testid': 'lesson-step' }, `Stage ${index + 1} of ${def.stages.length} · ${STAGE_NAMES[stage.type]}`)];
  }

  function paintHelp() {
    helpSlot.replaceChildren();
    if (!helpOpen) return;
    const stage = resolveStage(def.stages[index], level);
    const h = helpFor(stage, rung || 1);
    const box = el('div', { class: 'ws-help', 'data-testid': 'help-panel' });
    box.append(el('h2', {}, `No problem. Way ${h.rung} of ${MAX_RUNG}`));
    box.append(richText('p', h.text, glossary, showTerm));
    const row = el('div', { class: 'row' });
    if (!h.last) row.append(btn('Show me another way', 'lhelp-more', () => { rung = h.rung + 1; paintHelp(); }));
    else row.append(el('span', { class: 'muted' }, 'That is the last way. Take your time, and use Back to read it again.'));
    row.append(btn('Got it', 'lhelp-close', () => { helpOpen = false; rung = 0; paintHelp(); }));
    box.append(row);
    helpSlot.append(box);
  }

  function showTerm(id) {
    termShown = termShown === id ? null : id;
    termSlot.replaceChildren();
    const entry = glossary.find((g) => g.id === termShown);
    if (!entry) return;
    const box = el('div', { class: 'term-def', role: 'note', 'data-testid': 'term-def' });
    box.append(el('strong', {}, entry.term), el('span', {}, ` — ${definitionFor(entry, level)}`));
    termSlot.append(box);
  }

  const mentor = (text) => {
    const d = el('div', { class: 'dialogue' });
    d.append(el('span', { class: 'who' }, 'Commander Vega'), richText('span', text, glossary, showTerm));
    return d;
  };

  // ---- stages

  function drawStage(stage, body) {
    switch (stage.type) {
      case 'briefing':
      case 'debrief':
        for (const line of stage.lines) body.append(mentor(line));
        break;
      case 'learn':
        if (stage.toy) body.append(makeToy(typeof stage.toy === 'string' ? { kind: stage.toy, prompt: stage.toyPrompt } : stage.toy));
        for (const chunk of stage.chunks) body.append(mentor(chunk));
        break;
      case 'equation': return drawEquation(stage, body);
      case 'example': return drawExample(stage, body);
      case 'try':
      case 'maths': return drawQuestions(stage, body);
      case 'mission': return drawMission(stage, body);
      case 'python': return drawPython(stage, body);
      default:
        body.append(el('p', { class: 'muted' }, 'This stage is coming in a later update.'));
    }
  }

  function drawEquation(stage, body) {
    const f = formulas.find((x) => x.id === stage.formula);
    onFormula(f.id);
    if (stage.intro) body.append(mentor(stage.intro));
    body.append(formulaCard(f, level, true));
    body.append(el('p', { class: 'muted', 'data-testid': 'formula-saved' }, 'Saved to your Formula Book.'));
  }

  function drawExample(stage, body) {
    const list = el('ol', { class: 'steps', 'data-testid': 'example-steps' });
    let shown = 1;
    const more = btn('Next step', 'example-more', () => { shown += 1; paint(); });
    function paint() {
      list.replaceChildren(...stage.steps.slice(0, shown).map((s) => richText('li', s, glossary, showTerm)));
      more.hidden = shown >= stage.steps.length;
    }
    body.append(list, more);
    paint();
  }

  function drawQuestions(stage, body) {
    stage.questions.forEach((raw, qi) => {
      const key = `${sessionSeed}:${index}:${qi}`;
      const q = instantiate(raw, hashSeed(sessionSeed, replays, index, qi));
      const box = el('div', { class: 'question', 'data-testid': `q-${qi}` });
      box.append(richText('p', q.prompt, glossary, showTerm));
      const input = el('input', { inputmode: 'decimal', autocomplete: 'off', 'aria-label': 'Your answer', 'data-testid': `answer-${qi}` });
      const fb = el('p', { class: 'feedback', role: 'status', 'data-testid': `feedback-${qi}` });
      const hintBox = el('p', { class: 'muted', 'data-testid': `hint-${qi}` });
      let wrongTries = 0;
      let hints = 0;
      let finished = false;
      const finish = (revealed) => {
        finished = true;
        box.dataset.done = 'true';
        if (!answered.has(key)) {
          answered.add(key);
          recordOutcome(outcomeFor({ wrongTries, hints, revealed }));
        }
        updateNext();
      };
      const row = el('div', { class: 'row' });
      const reveal = btn('Show me the answer', `reveal-${qi}`, () => {
        fb.textContent = `${q.explain} (Answer: ${fmt(q.answer)}${q.unit ? ` ${q.unit}` : ''})`;
        fb.dataset.state = 'shown';
        finish(true);
      });
      reveal.hidden = true;
      row.append(
        btn('Check', `check-${qi}`, () => {
          const r = checkAnswer(q, input.value);
          if (r.understood && !r.correct) wrongTries += 1;
          fb.textContent = (r.correct ? 'Yes! ' : '') + r.text;
          fb.dataset.state = r.correct ? 'right' : 'wrong';
          if (r.correct && !finished) finish(false);
          reveal.hidden = r.correct || wrongTries < 2;
        }, ''),
        btn('Give me a hint', `hint-btn-${qi}`, () => {
          hintBox.textContent = q.hints[Math.min(hints, q.hints.length - 1)];
          hints += 1;
        }),
        reveal,
      );
      box.append(input, row, fb, hintBox);
      body.append(box);
    });
  }

  function drawPython(stage, body) {
    if (!runner) {
      body.append(mentor(stage.task), el('pre', { class: 'code', 'data-testid': 'python-starter' }, stage.starter));
      body.append(el('p', { class: 'muted', 'data-testid': 'python-soon' }, 'The Python lab is not available here. Read the code and say what you think it will print. You can carry on.'));
      return;
    }
    drawPythonLab(body, { stage, runner, completed, mentorLine: mentor, onRan: () => {} });
  }

  function drawMission(stageIn, body) {
    const stage = pickScenario(stageIn, replays + index);
    const tiers = Object.keys(stage.tiers);
    const tier = stage.tiers[missionTier] ?? stage.tiers.standard;
    const goal = tier.goal ?? stage.goal;

    body.append(mentor(stage.story));
    const chips = el('div', { class: 'chips', 'data-testid': 'tier-chips' });
    for (const t of tiers) {
      const chip = el('button', { type: 'button', class: 'chip', 'aria-pressed': String(t === missionTier), 'data-testid': `tier-${t}` }, t[0].toUpperCase() + t.slice(1));
      chip.addEventListener('click', () => {
        if (t === missionTier) return;
        missionTier = t;
        attempts = 0;
        missionHints = 0;
        render();
      });
      chips.append(chip);
    }
    body.append(chips, el('p', { 'data-testid': 'tier-text' }, tier.text));

    const status = el('p', { class: 'ws-status', role: 'status', 'data-testid': 'mission-status' });
    const offer = el('div', { class: 'row', 'data-testid': 'tier-offer' });
    const hintBox = el('p', { class: 'muted', 'data-testid': 'mission-hint' });

    const board = boardFromSpec(tier.start, { battery: stage.battery });
    let latest = board;
    const mkey = `${sessionSeed}:${index}:mission:${missionTier}`;

    function judge(manual) {
      const r = checkGoal(goal, latest);
      offer.replaceChildren();
      if (r.met) {
        const first = !missionDone;
        missionDone = true;
        finishedTier = finishedTier === 'stretch' || missionTier === 'stretch' ? 'stretch' : missionTier;
        status.dataset.tone = 'good';
        status.textContent = 'Mission complete! The launch pad is lit.';
        if (!answered.has(mkey)) {
          answered.add(mkey);
          recordOutcome(missionTier === 'training' ? 'ok' : outcomeFor({ wrongTries: attempts, hints: missionHints, revealed: false }));
        }
        const o = tierOffer({ tier: missionTier, attempts, passed: true, hasStretch: !!stage.tiers.stretch, hasTraining: !!stage.tiers.training });
        if (first && o === 'stretch') {
          offer.append(el('span', { class: 'muted' }, 'That was quick. Fancy a bonus?'), btn('Try the Stretch', 'offer-stretch', () => { missionTier = 'stretch'; attempts = 0; missionHints = 0; render(); }, ''));
        }
      } else {
        status.dataset.tone = '';
        status.textContent = manual ? `Not yet: ${r.notes.join(', ')}. Hints are below if you want one.` : 'Build it, then press "Check my circuit".';
        if (manual) {
          attempts += 1;
          const o = tierOffer({ tier: missionTier, attempts, passed: false, hasStretch: false, hasTraining: !!stage.tiers.training });
          if (o === 'training') {
            if (!answered.has(`${mkey}:struggle`)) {
              answered.add(`${mkey}:struggle`);
              recordOutcome('struggle');
            }
            offer.append(el('span', { class: 'muted' }, 'Want a gentler version with the parts already on the board?'), btn('Try Training', 'offer-training', () => { missionTier = 'training'; attempts = 0; missionHints = 0; render(); }, ''));
          }
        }
      }
      updateNext();
    }
    judge(false);

    const actions = el('div', { class: 'row' });
    actions.append(
      btn('Check my circuit', 'mission-check', () => judge(true), ''),
      btn('Give me a hint', 'mission-hint-btn', () => {
        hintBox.textContent = stage.hints[Math.min(missionHints, stage.hints.length - 1)];
        missionHints += 1;
      }),
    );
    body.append(status, actions, hintBox, offer);

    const holder = el('div', { 'data-testid': 'mission-workshop' });
    body.append(holder);
    stopWorkshop();
    workshop = mountWorkshop(holder, {
      profile: { level, workshop: board },
      embedded: true,
      allowedParts: stage.parts,
      partDefaults: stage.battery !== undefined ? { battery: { voltage: stage.battery } } : null,
      onSave: (b) => { latest = b; judge(false); },
      onExit: () => {},
      onLevelChange: (l) => setLevelNow(l),
    });
  }

  // ---- shell

  function updateNext() {
    if (!nextBtn) return;
    const stage = def.stages[index];
    const last = index === def.stages.length - 1;
    let ready = true;
    if (stage.type === 'try' || stage.type === 'maths') {
      ready = [...root.querySelectorAll('.question')].every((q) => q.dataset.done === 'true');
    }
    nextBtn.textContent = last ? 'Finish' : stage.type === 'mission' && !missionDone ? 'Skip for now' : 'Next';
    nextBtn.disabled = !ready;
    nextBtn.title = ready ? '' : 'Answer the question first, or tap "Show me the answer".';
  }

  function render() {
    const stage = resolveStage(def.stages[index], level);
    root.replaceChildren(...header(stage));
    noteSlot = el('div');
    helpSlot = el('div');
    termSlot = el('div');
    root.append(noteSlot, helpSlot);
    const body = el('div', { class: 'lesson-body', 'data-testid': 'stage-body' });
    if (stage.type !== 'mission') stopWorkshop();
    root.append(body);

    nextBtn = btn('Next', 'lesson-next', advance, '');
    drawStage(stage, body);
    body.append(termSlot);
    termShown = null;
    paintNote();
    paintHelp();

    if (stage.fellBack.length) {
      const used = levelInfo(Math.min(...stage.fellBack)).name;
      body.append(el('p', { class: 'muted', 'data-testid': 'fallback-note' }, `Part of this is written at ${used} level for now. Your level is coming.`));
    }

    const nav = el('div', { class: 'row' });
    if (index > 0) nav.append(btn('Back', 'lesson-back', () => go(index - 1), 'secondary'));
    nav.append(nextBtn);
    root.append(nav);
    updateNext();
  }

  function go(i) {
    index = i;
    rung = 0;
    helpOpen = false;
    termShown = null;
    render();
  }

  function advance() {
    if (index >= def.stages.length - 1) return finish();
    if (pendingLevel !== null) {
      level = pendingLevel;
      pendingLevel = null;
      onLevelChange(level);
    }
    note = null;
    go(index + 1);
  }

  function finish() {
    stopWorkshop();
    if (missionDone) onFinish(def.id, finishedTier ?? 'standard');
    const done = el('div', { class: 'panel', 'data-testid': 'lesson-complete' });
    done.append(el('p', { class: 'eyebrow' }, def.title));
    if (missionDone) {
      done.append(el('h1', {}, 'Mission complete.'), mentor(`Patch earned: ${def.title}. ${finishedTier === 'stretch' ? 'And a bonus star for the Stretch.' : 'Come back for the Stretch star any time.'} Replay it for new numbers and a new challenge.`));
      const part = partForLesson(def.id);
      if (part) done.append(el('p', { class: 'dash-installed', 'data-testid': 'part-installed' }, `New part built for your Mission Control panel: ${part.name}. ${part.blurb}`));
    } else {
      done.append(el('h1', {}, 'Nearly there.'), mentor('The mission is not finished yet. Come back whenever you like. Your progress is not lost.'));
    }
    const row = el('div', { class: 'row' });
    row.append(
      btn('Back to base', 'lesson-done', onExit, ''),
      btn('Replay with new numbers', 'lesson-replay', () => {
        replays += 1;
        sessionSeed = Math.floor(Math.random() * 2 ** 31);
        index = 0;
        missionDone = false;
        finishedTier = null;
        attempts = 0;
        missionHints = 0;
        missionTier = 'standard';
        answered.clear();
        container.replaceChildren(root);
        render();
      }),
    );
    done.append(row);
    root.replaceChildren(done);
  }

  render();
  return { unmount: stopWorkshop, get seed() { return sessionSeed; } };
}

// ------------------------------------------------------------------ formula card + book + mission list

export function formulaCard(f, level, compact = false) {
  const card = el('article', { class: 'formula', 'data-testid': `formula-${f.id}` });
  card.append(el('h2', {}, f.name), el('p', { class: 'equation', 'data-testid': 'equation' }, f.equation));
  const sym = el('ul', { class: 'symbols' });
  for (const s of f.symbols) sym.append(el('li', {}, `${s.symbol} = ${s.name}, in ${s.unit}`));
  card.append(sym);
  card.append(el('p', {}, `Rearranged: ${f.rearranged.join('   ·   ')}`));
  const plain = Object.keys(f.plain).map(Number).sort((a, b) => a - b);
  const use = plain.filter((n) => n <= level).pop() ?? plain[0];
  card.append(el('p', { class: 'muted' }, f.plain[use]));
  return card;
}

export function renderBook(container, { formulas, glossary, unlocked, level, onBack }) {
  const panel = el('section', { class: 'panel', 'data-testid': 'book' });
  panel.append(el('p', { class: 'eyebrow' }, 'Formula Book'), el('h1', {}, 'Formula Book'));
  const mine = formulas.filter((f) => unlocked.includes(f.id));
  if (mine.length === 0) panel.append(el('p', { class: 'muted', 'data-testid': 'book-empty' }, 'Empty for now. Equations land here as you meet them in missions.'));
  for (const f of mine) panel.append(formulaCard(f, level));
  panel.append(el('h2', {}, 'Glossary'));
  const dl = el('dl', { class: 'glossary', 'data-testid': 'glossary' });
  for (const g of glossary) dl.append(el('dt', {}, g.term), el('dd', {}, definitionFor(g, level)));
  panel.append(dl, btn('Back to base', 'book-back', onBack, ''));
  container.replaceChildren(panel);
}

export function renderMissionList(container, { lessons, completed, onPick, onBack }) {
  const panel = el('section', { class: 'panel', 'data-testid': 'missions' });
  panel.append(el('p', { class: 'eyebrow' }, 'Missions'), el('h1', {}, 'Pick a mission'));
  const list = el('div', { class: 'stack' });
  for (const l of lessons) {
    const stars = starsFor(completed, l.id);
    const card = el('button', { type: 'button', class: 'profile-card', 'data-testid': `mission-${l.id}` });
    card.append(
      el('strong', {}, `${l.title}${stars.done ? ' ✔' : ''}${stars.stretch ? ' ★' : ''}`),
      el('span', { class: 'muted' }, l.blurb),
    );
    card.addEventListener('click', () => onPick(l));
    list.append(card);
  }
  panel.append(list, btn('Back to base', 'missions-back', onBack, ''));
  container.replaceChildren(panel);
}

export { recordFinish };
