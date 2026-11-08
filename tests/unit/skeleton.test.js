import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeCandidateId, programmeInitials } from '../../src/progress/store.js';

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
