import { createStore, MAX_PROFILES } from '../progress/store.js';
import { LEVELS, levelInfo } from '../progress/levels.js';
import { mountWorkshop } from '../sandbox/sandbox.js';

const app = document.getElementById('app');

async function loadConfig() {
  const res = await fetch('config/app.config.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load config (${res.status})`);
  return res.json();
}

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label, testid, onClick, cls = '') {
  const b = el('button', { type: 'button', 'data-testid': testid }, label);
  if (cls) b.className = cls;
  b.addEventListener('click', onClick);
  return b;
}

function dialogue(who, text) {
  const d = el('div', { class: 'dialogue' });
  d.append(el('span', { class: 'who' }, who), el('span', {}, text));
  return d;
}

function levelPill(level) {
  const info = levelInfo(level);
  return el('span', { class: 'pill', 'data-testid': 'level-pill' }, `Level ${info.id} · ${info.name}`);
}

function start(config, store) {
  let workshop = null;

  function render() {
    if (workshop) {
      workshop.unmount();
      workshop = null;
    }
    document.body.classList.remove('wide');
    const active = store.getActive();
    if (active) return renderHome(active);
    if (store.listProfiles().length === 0) return renderRecruitment(true);
    return renderPicker();
  }

  function renderWorkshop(profile) {
    app.replaceChildren();
    document.body.classList.add('wide');
    const holder = el('div');
    app.append(holder);
    workshop = mountWorkshop(holder, {
      profile,
      onSave: (board) => store.updateProfile(profile.id, { workshop: board }),
      onLevelChange: (level) => store.updateProfile(profile.id, { level }),
      onExit: () => render(),
    });
  }

  // ------------------------------------------------------------ who's flying

  function renderPicker() {
    app.replaceChildren();
    const panel = el('section', { class: 'panel', 'data-testid': 'picker' });
    panel.append(
      el('p', { class: 'eyebrow' }, config.programmeName),
      el('h1', {}, "Who's flying today?"),
    );
    const list = el('div', { class: 'stack' });
    for (const p of store.listProfiles()) {
      const card = el('button', { type: 'button', class: 'profile-card', 'data-testid': `profile-${p.id}` });
      card.append(
        el('strong', {}, p.name),
        el('span', {}, `Robot: ${p.robotName}`),
        el('span', { class: 'muted' }, `Level ${p.level} · ${levelInfo(p.level).name}`),
      );
      card.addEventListener('click', () => {
        store.selectProfile(p.id);
        render();
      });
      list.append(card);
    }
    panel.append(list);

    const actions = el('div', { class: 'row' });
    if (store.listProfiles().length < MAX_PROFILES) {
      actions.append(button('New candidate', 'new-profile', () => renderRecruitment(false)));
    }
    actions.append(
      button('Visit as guest (not saved)', 'start-guest', () => {
        store.startGuest();
        render();
      }, 'secondary'),
    );
    panel.append(actions);
    app.append(panel);
  }

  // ------------------------------------------------------------ recruitment

  function renderRecruitment(firstRun) {
    app.replaceChildren();
    const panel = el('section', { class: 'panel', 'data-testid': 'recruitment' });
    panel.append(
      el('p', { class: 'eyebrow' }, config.programmeName),
      el('h1', {}, 'Application accepted.'),
      el('p', { class: 'status', 'data-testid': 'status' }, 'STATUS: CANDIDATE PENDING'),
      dialogue(config.mentorName, 'Welcome aboard. Give me your name and name your robot. Then we get to work.'),
    );

    const form = el('form', { 'data-testid': 'enlist-form', novalidate: '' });
    form.append(
      el('label', { for: 'candidate-name' }, 'Your name'),
      el('input', { id: 'candidate-name', name: 'name', autocomplete: 'off', maxlength: '30', 'data-testid': 'name-input' }),
      el('label', { for: 'robot-name' }, 'Name your robot'),
      el('input', { id: 'robot-name', name: 'robot', autocomplete: 'off', maxlength: '30', 'data-testid': 'robot-input' }),
    );
    const error = el('p', { class: 'error', role: 'alert', 'data-testid': 'form-error' });
    error.hidden = true;
    form.append(error);

    const actions = el('div', { class: 'row' });
    actions.append(el('button', { type: 'submit', 'data-testid': 'enlist-button' }, 'Accept place'));
    if (!firstRun) actions.append(button('Back', 'recruit-back', () => render(), 'secondary'));
    else {
      actions.append(
        button('Just visiting? Try as guest', 'start-guest', () => {
          store.startGuest();
          render();
        }, 'secondary'),
      );
    }
    form.append(actions);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(form);
      try {
        store.createProfile({ name: data.get('name'), robotName: data.get('robot') });
        render();
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
      }
    });
    panel.append(form);
    app.append(panel);
  }

  // ------------------------------------------------------------ home

  function renderHome(profile, { showLevels = false, confirmDelete = false } = {}) {
    app.replaceChildren();
    const panel = el('section', { class: 'panel', 'data-testid': 'candidate' });
    panel.append(
      el('p', { class: 'eyebrow' }, config.programmeName),
      el('h1', { 'data-testid': 'welcome' }, `Welcome, Candidate ${profile.name}`),
      el('p', { class: 'status' }, profile.guest ? 'STATUS: GUEST (NOTHING IS SAVED)' : 'STATUS: CANDIDATE ACTIVE'),
    );

    const badge = el('div', { class: 'badge', 'data-testid': 'badge' });
    badge.append(
      el('div', { class: 'eyebrow' }, 'Candidate ID'),
      el('div', { class: 'id', 'data-testid': 'candidate-id' }, profile.candidateId ?? 'GUEST'),
      el('div', { 'data-testid': 'robot-name-display' }, `Robot: ${profile.robotName}`),
    );
    panel.append(badge);

    const levelRow = el('div', { class: 'row level-row' });
    levelRow.append(levelPill(profile.level), button('Change level', 'change-level', () => renderHome(profile, { showLevels: !showLevels }), 'secondary'));
    panel.append(levelRow);

    if (showLevels) panel.append(levelSheet(profile));

    panel.append(
      dialogue(config.mentorName, `${profile.robotName} is on the pad. Launch Prep opens soon. Stand by.`),
    );

    const actions = el('div', { class: 'row' });
    actions.append(
      button('Open workshop', 'open-workshop', () => renderWorkshop(store.getActive())),
      button(profile.guest ? 'Leave guest mode' : 'Switch candidate', 'switch-profile', () => {
        store.leave();
        render();
      }, 'secondary'),
    );
    if (!profile.guest && !confirmDelete) {
      actions.append(button('Delete this candidate', 'delete-profile', () => renderHome(profile, { confirmDelete: true }), 'secondary'));
    }
    panel.append(actions);

    if (confirmDelete) {
      const box = el('div', { class: 'confirm', role: 'alertdialog', 'data-testid': 'delete-confirm' });
      box.append(el('p', {}, `Delete ${profile.name} and all their progress? This cannot be undone.`));
      const row = el('div', { class: 'row' });
      row.append(
        button('Yes, delete', 'confirm-delete', () => {
          store.deleteProfile(profile.id);
          render();
        }),
        button('No, keep them', 'cancel-delete', () => renderHome(profile), 'secondary'),
      );
      box.append(row);
      panel.append(box);
    }
    app.append(panel);
  }

  function levelSheet(profile) {
    const sheet = el('div', { class: 'sheet', 'data-testid': 'level-sheet' });
    sheet.append(el('p', { class: 'muted' }, 'Pick any level, any time. Nothing is locked, and you can switch back.'));
    for (const l of LEVELS) {
      const opt = el('button', {
        type: 'button',
        class: 'level-option',
        'aria-pressed': String(l.id === profile.level),
        'data-testid': `level-${l.id}`,
      });
      opt.append(el('strong', {}, `Level ${l.id} · ${l.name}`), el('span', { class: 'muted' }, `${l.stage}. ${l.blurb}`));
      opt.addEventListener('click', () => {
        store.updateProfile(profile.id, { level: l.id });
        renderHome(store.getActive());
      });
      sheet.append(opt);
    }
    return sheet;
  }

  render();
}

async function main() {
  try {
    const config = await loadConfig();
    document.title = config.programmeName;
    start(config, createStore(window.localStorage, config.programmeName));
  } catch (err) {
    app.replaceChildren(el('p', { class: 'error', 'data-testid': 'fatal' }, `Launch failed: ${err.message}`));
  }
}

main();
