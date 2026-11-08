import { createStore } from '../progress/store.js';

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

function renderRecruitment(config, store) {
  app.replaceChildren();
  const panel = el('section', { class: 'panel', 'data-testid': 'recruitment' });
  panel.append(
    el('p', { class: 'eyebrow' }, config.programmeName),
    el('h1', {}, 'Application accepted.'),
    el('p', { class: 'status', 'data-testid': 'status' }, 'STATUS: CANDIDATE PENDING'),
  );

  const dialogue = el('div', { class: 'dialogue' });
  dialogue.append(
    el('span', { class: 'who' }, config.mentorName),
    el('span', {}, 'Welcome aboard. Give me your name and name your robot. Then we get to work.'),
  );
  panel.append(dialogue);

  const form = el('form', { 'data-testid': 'enlist-form', novalidate: '' });
  form.append(
    el('label', { for: 'candidate-name' }, 'Your name'),
    el('input', { id: 'candidate-name', name: 'name', autocomplete: 'off', 'data-testid': 'name-input' }),
    el('label', { for: 'robot-name' }, 'Name your robot'),
    el('input', { id: 'robot-name', name: 'robot', autocomplete: 'off', 'data-testid': 'robot-input' }),
  );
  const error = el('p', { class: 'error', role: 'alert', 'data-testid': 'form-error' });
  error.hidden = true;
  form.append(error);
  form.append(el('button', { type: 'submit', 'data-testid': 'enlist-button' }, 'Accept place'));

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    try {
      store.enlist(data.get('name'), data.get('robot'));
      renderCandidate(config, store);
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    }
  });

  panel.append(form);
  app.append(panel);
}

function renderCandidate(config, store) {
  const { learner } = store.load();
  if (!learner) return renderRecruitment(config, store);

  app.replaceChildren();
  const panel = el('section', { class: 'panel', 'data-testid': 'candidate' });
  panel.append(
    el('p', { class: 'eyebrow' }, config.programmeName),
    el('h1', { 'data-testid': 'welcome' }, `Welcome, Candidate ${learner.name}`),
    el('p', { class: 'status' }, 'STATUS: CANDIDATE ACTIVE'),
  );

  const badge = el('div', { class: 'badge', 'data-testid': 'badge' });
  badge.append(
    el('div', { class: 'eyebrow' }, 'Candidate ID'),
    el('div', { class: 'id', 'data-testid': 'candidate-id' }, learner.candidateId),
    el('div', { 'data-testid': 'robot-name-display' }, `Robot: ${learner.robotName}`),
  );
  panel.append(badge);

  const dialogue = el('div', { class: 'dialogue' });
  dialogue.append(
    el('span', { class: 'who' }, config.mentorName),
    el('span', {}, `${learner.robotName} is on the pad. Launch Prep opens soon. Stand by.`),
  );
  panel.append(dialogue);

  const reset = el('button', { type: 'button', class: 'secondary', 'data-testid': 'reset-button' }, 'Start again');
  reset.addEventListener('click', () => {
    store.reset();
    renderRecruitment(config, store);
  });
  panel.append(reset);
  app.append(panel);
}

async function start() {
  try {
    const config = await loadConfig();
    document.title = config.programmeName;
    const store = createStore(window.localStorage, config.programmeName);
    if (store.load().learner) renderCandidate(config, store);
    else renderRecruitment(config, store);
  } catch (err) {
    app.replaceChildren(el('p', { class: 'error', 'data-testid': 'fatal' }, `Launch failed: ${err.message}`));
  }
}

start();
