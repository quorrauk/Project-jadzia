import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, STORAGE_KEY, LEGACY_STORAGE_KEY, MAX_PROFILES } from '../../src/progress/store.js';
import { LEVELS, DEFAULT_LEVEL, isValidLevel, levelInfo, pickForLevel } from '../../src/progress/levels.js';

const PROGRAMME = 'Orbital Candidate Programme';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

const newStore = (storage = memoryStorage()) => createStore(storage, PROGRAMME);

// ---------------------------------------------------------------- levels

test('there are five levels, ids 1 to 5, each with a name and a plain-words blurb', () => {
  assert.deepEqual(LEVELS.map((l) => l.id), [1, 2, 3, 4, 5]);
  for (const l of LEVELS) {
    assert.ok(l.name && l.blurb && l.stage, `level ${l.id} needs name, stage and blurb`);
  }
  assert.equal(levelInfo(1).name, 'Cadet');
  assert.equal(levelInfo(5).stage, 'University');
});

test('level validation accepts 1 to 5 only', () => {
  for (const ok of [1, 2, 3, 4, 5]) assert.equal(isValidLevel(ok), true);
  for (const bad of [0, 6, 1.5, '2', null, undefined, NaN]) assert.equal(isValidLevel(bad), false);
});

test('pickForLevel returns an exact match when one exists', () => {
  const r = pickForLevel({ 1: 'easy', 2: 'mid', 3: 'hard' }, 2);
  assert.deepEqual(r, { value: 'mid', usedLevel: 2, exact: true });
});

test('pickForLevel falls back to the nearest lower level and says so', () => {
  const r = pickForLevel({ 1: 'easy', 3: 'hard' }, 5);
  assert.deepEqual(r, { value: 'hard', usedLevel: 3, exact: false });
  assert.deepEqual(pickForLevel({ 1: 'easy', 3: 'hard' }, 2), { value: 'easy', usedLevel: 1, exact: false });
});

test('pickForLevel falls back upward only when nothing lower exists', () => {
  assert.deepEqual(pickForLevel({ 4: 'a-level' }, 1), { value: 'a-level', usedLevel: 4, exact: false });
});

test('pickForLevel returns null for no variants', () => {
  assert.equal(pickForLevel({}, 3), null);
  assert.equal(pickForLevel(undefined, 3), null);
});

// ---------------------------------------------------------------- profiles

test('fresh store has no profiles and no active profile', () => {
  const store = newStore();
  assert.deepEqual(store.listProfiles(), []);
  assert.equal(store.getActive(), null);
});

test('createProfile stores a trimmed profile at the default level and makes it active', () => {
  const store = newStore();
  const p = store.createProfile({ name: '  Ada ', robotName: ' Rover ' });
  assert.equal(p.name, 'Ada');
  assert.equal(p.robotName, 'Rover');
  assert.equal(p.level, DEFAULT_LEVEL);
  assert.match(p.candidateId, /^OCP-[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(store.getActive().id, p.id);
});

test('createProfile rejects empty or over-long names', () => {
  const store = newStore();
  assert.throws(() => store.createProfile({ name: '', robotName: 'R' }), /name is required/);
  assert.throws(() => store.createProfile({ name: 'Ada', robotName: '  ' }), /Robot name is required/);
  assert.throws(() => store.createProfile({ name: 'x'.repeat(31), robotName: 'R' }), /30 characters/);
});

test('profiles survive a reload and keep separate data', () => {
  const storage = memoryStorage();
  const a = newStore(storage).createProfile({ name: 'Ada', robotName: 'Rover' });
  const b = newStore(storage).createProfile({ name: 'Mr Jones', robotName: 'Bolt' });
  const reloaded = newStore(storage);
  assert.equal(reloaded.listProfiles().length, 2);
  assert.notEqual(a.candidateId, b.candidateId);
  assert.equal(reloaded.getActive().id, b.id, 'last created profile stays active');
  reloaded.selectProfile(a.id);
  assert.equal(newStore(storage).getActive().name, 'Ada');
});

test('two profiles can share a name', () => {
  const store = newStore();
  store.createProfile({ name: 'Sam', robotName: 'A' });
  store.createProfile({ name: 'Sam', robotName: 'B' });
  assert.equal(store.listProfiles().length, 2);
});

test('profile count is capped', () => {
  const store = newStore();
  for (let i = 0; i < MAX_PROFILES; i++) store.createProfile({ name: `P${i}`, robotName: 'R' });
  assert.throws(() => store.createProfile({ name: 'One too many', robotName: 'R' }), /up to/);
});

test('selectProfile rejects unknown ids; leave() returns to the picker', () => {
  const store = newStore();
  const p = store.createProfile({ name: 'Ada', robotName: 'Rover' });
  assert.throws(() => store.selectProfile('nope'), /No such profile/);
  store.leave();
  assert.equal(store.getActive(), null);
  assert.equal(store.listProfiles().length, 1, 'leaving does not delete anyone');
  store.selectProfile(p.id);
  assert.equal(store.getActive().id, p.id);
});

// ---------------------------------------------------------------- levels per profile

test('any level can be chosen at any time, up to 5, and sticks to that profile only', () => {
  const storage = memoryStorage();
  const store = newStore(storage);
  const a = store.createProfile({ name: 'Ada', robotName: 'Rover' });
  const b = store.createProfile({ name: 'Teacher', robotName: 'Bolt' });
  store.updateProfile(a.id, { level: 5 });
  assert.equal(newStore(storage).listProfiles().find((p) => p.id === a.id).level, 5);
  assert.equal(newStore(storage).listProfiles().find((p) => p.id === b.id).level, 1);
  store.updateProfile(a.id, { level: 2 });
  assert.equal(store.listProfiles().find((p) => p.id === a.id).level, 2, 'can go back down too');
});

test('invalid levels are rejected', () => {
  const store = newStore();
  const p = store.createProfile({ name: 'Ada', robotName: 'Rover' });
  assert.throws(() => store.updateProfile(p.id, { level: 9 }), /level/i);
});

test('updateProfile only accepts known fields', () => {
  const store = newStore();
  const p = store.createProfile({ name: 'Ada', robotName: 'Rover' });
  assert.throws(() => store.updateProfile(p.id, { candidateId: 'HACK' }), /Cannot change/);
  store.updateProfile(p.id, { completed: ['arc1-p1'], workshop: { parts: [], wires: [] } });
  const after = store.listProfiles()[0];
  assert.deepEqual(after.completed, ['arc1-p1']);
  assert.deepEqual(after.workshop, { parts: [], wires: [] });
});

// ---------------------------------------------------------------- delete

test('deleteProfile removes only that profile and clears active if it was active', () => {
  const store = newStore();
  const a = store.createProfile({ name: 'Ada', robotName: 'Rover' });
  const b = store.createProfile({ name: 'Mr Jones', robotName: 'Bolt' });
  store.deleteProfile(b.id);
  assert.equal(store.getActive(), null);
  assert.deepEqual(store.listProfiles().map((p) => p.id), [a.id]);
  assert.throws(() => store.deleteProfile('nope'), /No such profile/);
});

// ---------------------------------------------------------------- guest

test('guest mode works, is never written to storage, and vanishes on reload', () => {
  const storage = memoryStorage();
  const store = newStore(storage);
  const real = store.createProfile({ name: 'Ada', robotName: 'Rover' });
  const before = storage.getItem(STORAGE_KEY);

  const guest = store.startGuest();
  assert.equal(guest.guest, true);
  assert.equal(store.getActive().id, 'guest');
  store.updateProfile('guest', { level: 5, workshop: { parts: [{ id: 'B1' }], wires: [] } });
  assert.equal(store.getActive().level, 5);

  assert.equal(storage.getItem(STORAGE_KEY), before, 'storage is byte-for-byte unchanged by guest play');
  // Guest wrote nothing, so a reload lands back on whoever was active before. No guest survives.
  assert.equal(newStore(storage).getActive().id, real.id, 'after reload the guest is gone');
  assert.equal(newStore(storage).listProfiles().length, 1);
  assert.equal(newStore(storage).listProfiles()[0].id, real.id);
});

test('leaving guest mode discards it', () => {
  const store = newStore();
  store.startGuest();
  store.leave();
  assert.equal(store.getActive(), null);
});

test('guest does not count towards the profile cap', () => {
  const store = newStore();
  for (let i = 0; i < MAX_PROFILES; i++) store.createProfile({ name: `P${i}`, robotName: 'R' });
  assert.doesNotThrow(() => store.startGuest());
});

// ---------------------------------------------------------------- migration and resilience

test('a v1 single-learner save is migrated into a profile, nothing lost', () => {
  const storage = memoryStorage();
  storage.setItem(
    LEGACY_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      learner: { name: 'Ada', robotName: 'Rover', candidateId: 'OCP-ABC234', enlistedOn: '2026-11-08' },
      completed: ['arc1-p1'],
    }),
  );
  const store = newStore(storage);
  const profiles = store.listProfiles();
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].name, 'Ada');
  assert.equal(profiles[0].candidateId, 'OCP-ABC234', 'candidate ID is kept');
  assert.deepEqual(profiles[0].completed, ['arc1-p1']);
  assert.equal(profiles[0].level, DEFAULT_LEVEL);
  assert.equal(store.getActive().name, 'Ada', 'she lands back on her own screen');
  assert.ok(storage.getItem(STORAGE_KEY), 'v2 data is written');
  assert.equal(newStore(storage).listProfiles().length, 1, 'migration does not run twice');
});

test('a v1 save with no learner migrates to an empty store', () => {
  const storage = memoryStorage();
  storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ version: 1, learner: null, completed: [] }));
  assert.deepEqual(newStore(storage).listProfiles(), []);
});

test('corrupt storage falls back to an empty store instead of crashing', () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, '{not json');
  const store = newStore(storage);
  assert.deepEqual(store.listProfiles(), []);
  assert.equal(store.getActive(), null);
  assert.doesNotThrow(() => store.createProfile({ name: 'Ada', robotName: 'Rover' }));
});

test('reset wipes every profile', () => {
  const store = newStore();
  store.createProfile({ name: 'Ada', robotName: 'Rover' });
  store.reset();
  assert.deepEqual(store.listProfiles(), []);
});
