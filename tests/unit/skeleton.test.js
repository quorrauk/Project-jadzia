import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createStore,
  makeCandidateId,
  programmeInitials,
  STORAGE_KEY,
} from '../../src/progress/store.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('config file is valid JSON with required keys', () => {
  const config = JSON.parse(readFileSync('config/app.config.json', 'utf8'));
  for (const key of ['programmeName', 'mentorName', 'robot', 'learner', 'github', 'pyodide', 'features', 'contentVersion']) {
    assert.ok(key in config, `missing config key: ${key}`);
  }
  assert.equal(config.learner.name, '', 'learner name must not be committed');
  assert.equal(config.robot.name, '', 'robot name must not be committed');
});

test('programme initials come from the programme name', () => {
  assert.equal(programmeInitials('Orbital Candidate Programme'), 'OCP');
});

test('candidate ID has the expected shape and avoids look-alike characters', () => {
  const id = makeCandidateId('Orbital Candidate Programme');
  assert.match(id, /^OCP-[A-HJ-NP-Z2-9]{6}$/);
});

test('enlist stores the learner and survives a reload', () => {
  const storage = memoryStorage();
  const store = createStore(storage, 'Orbital Candidate Programme');
  const learner = store.enlist('  Ada ', ' Rover ');
  assert.equal(learner.name, 'Ada');
  assert.equal(learner.robotName, 'Rover');

  const reloaded = createStore(storage, 'Orbital Candidate Programme').load();
  assert.equal(reloaded.learner.candidateId, learner.candidateId);
});

test('enlist rejects empty names', () => {
  const store = createStore(memoryStorage(), 'Orbital Candidate Programme');
  assert.throws(() => store.enlist('', 'Rover'), /name is required/);
  assert.throws(() => store.enlist('Ada', '  '), /Robot name is required/);
});

test('corrupt storage falls back to empty progress instead of crashing', () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, '{not json');
  const data = createStore(storage, 'Orbital Candidate Programme').load();
  assert.equal(data.learner, null);
});

test('reset clears progress', () => {
  const storage = memoryStorage();
  const store = createStore(storage, 'Orbital Candidate Programme');
  store.enlist('Ada', 'Rover');
  store.reset();
  assert.equal(store.load().learner, null);
});
