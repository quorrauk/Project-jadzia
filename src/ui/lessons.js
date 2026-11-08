// Lesson player and Formula Book screens. Logic lives in src/lessons/engine.js; this file only draws.

import { levelInfo, LEVELS } from '../progress/levels.js';
import {
  resolveStage, linkTerms, helpFor, checkAnswer, checkGoal, tierOffer, recordFinish, starsFor, MAX_RUNG,
} from '../lessons/engine.js';
import { mountWorkshop } from '../sandbox/sandbox.js';
import { createBoard, starterBoard } from '../sandbox/model.js';

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

function startBoard(kind) {
  return kind === 'starter' ? starterBoard() : createBoard();
}

// ------------------------------------------------------------------ the player

export function mountLesson(container, { def, profile, glossary, formulas, onExit, onFormula, onFinish, onLevelChange }) {
  let level = profile.level;
  let index = 0;
  let rung = 0;
  let workshop = null;
  let missionTier = 'standard';
  let missionDone = false;
  let finishedTier = null;
  let attempts = 0;
  let termShown = null;

  const root = el('section', { class: 'lesson', 'data-testid': 'lesson' });
  container.replaceChildren(root);

  function stopWorkshop() {
    if (workshop) {
      workshop.unmount();
      workshop = null;
    }
  }

  function header(stage) {
    const bar = el('header', { class: 'ws-top' });
    bar.append(btn('← Base', 'lesson-exit', () => { stopWorkshop(); onExit(); }));
    const title = el('h1', {}, def.title);
    bar.append(title);
    const label = el('label', { class: 'ws-level' });
    label.append(el('span', { class: 'sr-only' }, 'Level'));
    const select = el('select', { 'data-testid': 'lesson-level' });
    for (const l of LEVELS) {
      const o = el('option', { value: String(l.id) }, `Level ${l.id} · ${l.name}`);
      if (l.id === level) o.selected = true;
      select.append(o);
    }
    select.addEventListener('change', () => {
      level = Number(select.value);
      onLevelChange(level);
      render();
    });
    label.append(select);
    bar.append(label, btn("I don't get it", 'lesson-help', () => { rung = rung === 0 ? 1 : rung; helpOpen = !helpOpen; render(); }));
    const step = el('p', { class: 'eyebrow', 'data-testid': 'lesson-step' }, `Stage ${index + 1} of ${def.stages.length} · ${STAGE_NAMES[stage.type]}`);
    return [bar, step];
  }

  let helpOpen = false;

  function helpPanel(stage) {
    const h = helpFor(stage, rung || 1);
    const box = el('div', { class: 'ws-help', 'data-testid': 'help-panel' });
    box.append(el('h2', {}, `No problem. Way ${h.rung} of ${MAX_RUNG}`));
    box.append(richText('p', h.text, glossary, showTerm));
    const row = el('div', { class: 'row' });
    if (!h.last) row.append(btn('Show me another way', 'lhelp-more', () => { rung = h.rung + 1; render(); }));
    else row.append(el('span', { class: 'muted' }, 'That is the last way. Take your time, and use Back to read it again.'));
    row.append(btn('Got it', 'lhelp-close', () => { helpOpen = false; rung = 0; render(); }));
    box.append(row);
    return box;
  }

  function showTerm(id) {
    termShown = termShown === id ? null : id;
    render();
  }

  function termBox() {
    if (!termShown) return null;
    const entry = glossary.find((g) => g.id === termShown);
    if (!entry) return null;
    const box = el('div', { class: 'term-def', role: 'note', 'data-testid': 'term-def' });
    box.append(el('strong', {}, entry.term), el('span', {}, ` — ${definitionFor(entry, level)}`));
    return box;
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
      case 'learn': return drawLearn(stage, body);
      case 'equation': return drawEquation(stage, body);
      case 'example': return drawExample(stage, body);
      case 'try':
      case 'maths': return drawQuestions(stage, body);
      case 'mission': return drawMission(stage, body);
      default:
        body.append(el('p', { class: 'muted' }, 'This stage is coming in a later update.'));
    }
  }

  function drawLearn(stage, body) {
    if (stage.toy === 'bulb-switch') {
      const toy = el('div', { class: 'toy', 'data-testid': 'toy' });
      toy.append(el('p', { class: 'muted' }, stage.toyPrompt ?? 'Have a play.'));
      const lamp = el('div', { class: 'toy-bulb', 'data-testid': 'toy-bulb', 'data-lit': 'false' }, 'Bulb: dark');
      const sw = el('button', { type: 'button', 'aria-pressed': 'false', 'data-testid': 'toy-switch' }, 'Switch: open');
      sw.style.marginTop = '0';
      sw.addEventListener('click', () => {
        const on = sw.getAttribute('aria-pressed') !== 'true';
        sw.setAttribute('aria-pressed', String(on));
        sw.textContent = on ? 'Switch: closed' : 'Switch: open';
        lamp.dataset.lit = String(on);
        lamp.textContent = on ? 'Bulb: glowing' : 'Bulb: dark';
      });
      toy.append(sw, lamp);
      body.append(toy);
    }
    for (const chunk of stage.chunks) body.append(mentor(chunk));
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
    const more = btn('Next step', 'example-more', () => {
      shown += 1;
      paint();
    });
    function paint() {
      list.replaceChildren(...stage.steps.slice(0, shown).map((s) => el('li', {}, s)));
      more.hidden = shown >= stage.steps.length;
    }
    body.append(list, more);
    paint();
  }

  function drawQuestions(stage, body) {
    stage.questions.forEach((q, qi) => {
      const box = el('div', { class: 'question', 'data-testid': `q-${qi}` });
      box.append(richText('p', q.prompt, glossary, showTerm));
      const input = el('input', { inputmode: 'decimal', autocomplete: 'off', 'aria-label': 'Your answer', 'data-testid': `answer-${qi}` });
      const fb = el('p', { class: 'feedback', role: 'status', 'data-testid': `feedback-${qi}` });
      const hintBox = el('p', { class: 'muted', 'data-testid': `hint-${qi}` });
      let tries = 0;
      let hints = 0;
      const row = el('div', { class: 'row' });
      row.append(
        btn('Check', `check-${qi}`, () => {
          const r = checkAnswer(q, input.value);
          if (r.understood) tries += 1;
          fb.textContent = (r.correct ? 'Yes! ' : '') + r.text;
          fb.dataset.state = r.correct ? 'right' : 'wrong';
          if (r.correct) box.dataset.done = 'true';
          showAnswerBtn.hidden = r.correct || tries < 2;
          if (r.correct) stage._solved = (stage._solved ?? new Set()).add(qi);
          updateNext();
        }, ''),
        btn('Give me a hint', `hint-btn-${qi}`, () => {
          hintBox.textContent = q.hints[Math.min(hints, q.hints.length - 1)];
          hints += 1;
        }),
      );
      const showAnswerBtn = btn('Show me the answer', `reveal-${qi}`, () => {
        fb.textContent = q.explain;
        fb.dataset.state = 'shown';
        box.dataset.done = 'true';
        updateNext();
      });
      showAnswerBtn.hidden = true;
      row.append(showAnswerBtn);
      box.append(input, row, fb, hintBox);
      body.append(box);
    });
  }

  function drawMission(stage, body) {
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
        render();
      });
      chips.append(chip);
    }
    body.append(chips, el('p', { 'data-testid': 'tier-text' }, tier.text));

    const status = el('p', { class: 'ws-status', role: 'status', 'data-testid': 'mission-status' });
    const offer = el('div', { class: 'row', 'data-testid': 'tier-offer' });
    const hintBox = el('p', { class: 'muted', 'data-testid': 'mission-hint' });
    let hints = 0;

    const board = startBoard(tier.start);
    let latest = board;

    function judge(manual) {
      const r = checkGoal(goal, latest);
      offer.replaceChildren();
      if (r.met) {
        const first = !missionDone;
        missionDone = true;
        finishedTier = finishedTier === 'stretch' || missionTier === 'stretch' ? 'stretch' : missionTier;
        status.dataset.tone = 'good';
        status.textContent = 'Mission complete! The launch pad is lit.';
        const o = tierOffer({ tier: missionTier, attempts, passed: true, hasStretch: !!stage.tiers.stretch, hasTraining: !!stage.tiers.training });
        if (first && o === 'stretch') {
          offer.append(el('span', { class: 'muted' }, 'That was quick. Fancy a bonus?'), btn('Try the Stretch', 'offer-stretch', () => { missionTier = 'stretch'; attempts = 0; render(); }, ''));
        }
      } else {
        status.dataset.tone = '';
        status.textContent = manual ? `Not yet: ${r.notes.join(', ')}. Hints are below if you want one.` : 'Build it, then press "Check my circuit".';
        if (manual) {
          attempts += 1;
          const o = tierOffer({ tier: missionTier, attempts, passed: false, hasStretch: false, hasTraining: !!stage.tiers.training });
          if (o === 'training') {
            offer.append(el('span', { class: 'muted' }, 'Want a gentler version with the parts already on the board?'), btn('Try Training', 'offer-training', () => { missionTier = 'training'; attempts = 0; render(); }, ''));
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
        hintBox.textContent = stage.hints[Math.min(hints, stage.hints.length - 1)];
        hints += 1;
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
      onSave: (b) => { latest = b; judge(false); },
      onExit: () => {},
      onLevelChange: (l) => { level = l; onLevelChange(l); },
    });
  }

  // ---- shell

  let nextBtn;
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
    const raw = def.stages[index];
    const stage = resolveStage(raw, level);
    root.replaceChildren(...header(stage));
    if (helpOpen) root.append(helpPanel(stage));
    const body = el('div', { class: 'lesson-body', 'data-testid': 'stage-body' });
    if (stage.type !== 'mission') stopWorkshop();
    root.append(body);

    nextBtn = btn('Next', 'lesson-next', advance, '');
    drawStage(stage, body);
    const tb = termBox();
    if (tb) body.append(tb);

    if (stage.fellBack.length) {
      const used = levelInfo(Math.min(...stage.fellBack)).name;
      body.append(el('p', { class: 'muted', 'data-testid': 'fallback-note' }, `Part of this is written at ${used} level for now. Your level is coming.`));
    }

    const nav = el('div', { class: 'row' });
    if (index > 0) nav.append(btn('Back', 'lesson-back', () => { index -= 1; rung = 0; helpOpen = false; termShown = null; render(); }));
    nav.append(nextBtn);
    root.append(nav);
    updateNext();
  }

  function advance() {
    if (index < def.stages.length - 1) {
      index += 1;
      rung = 0;
      helpOpen = false;
      termShown = null;
      render();
    } else finish();
  }

  function finish() {
    stopWorkshop();
    if (missionDone) onFinish(def.id, finishedTier ?? 'standard');
    const done = el('div', { class: 'panel', 'data-testid': 'lesson-complete' });
    done.append(el('p', { class: 'eyebrow' }, def.title));
    if (missionDone) {
      done.append(el('h1', {}, 'Mission complete.'), mentor(`Patch earned: ${def.title}. ${finishedTier === 'stretch' ? 'And a bonus star for the Stretch.' : 'Come back for the Stretch star any time.'}`));
    } else {
      done.append(el('h1', {}, 'Nearly there.'), mentor('The mission is not finished yet. Come back whenever you like. Your progress is not lost.'));
    }
    const row = el('div', { class: 'row' });
    row.append(btn('Back to base', 'lesson-done', onExit, ''), btn('Replay', 'lesson-replay', () => { index = 0; missionDone = false; finishedTier = null; attempts = 0; missionTier = 'standard'; container.replaceChildren(root); render(); }));
    done.append(row);
    root.replaceChildren(done);
  }

  render();
  return { unmount: stopWorkshop };
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
