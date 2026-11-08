// Progress store (v2): several profiles in one browser, plus a guest mode that is never saved.
// Pure logic with an injectable storage so it runs in node tests.
// All data lives only in the browser (localStorage). Nothing is sent anywhere.

import { DEFAULT_LEVEL, isValidLevel } from './levels.js';

export const STORAGE_KEY = 'jadzia.progress.v2';
export const LEGACY_STORAGE_KEY = 'jadzia.progress.v1';
export const MAX_PROFILES = 12;
export const MAX_NAME_LENGTH = 30;

const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1
const UPDATABLE = ['name', 'robotName', 'level', 'completed', 'workshop'];

export function programmeInitials(programmeName) {
  const letters = String(programmeName || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join('');
  return letters || 'OCP';
}

export function makeCandidateId(programmeName, random = Math.random) {
  let body = '';
  for (let i = 0; i < 6; i++) {
    body += ID_CHARS[Math.floor(random() * ID_CHARS.length)];
  }
  return `${programmeInitials(programmeName)}-${body}`;
}

function cleanText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  if (text.length > MAX_NAME_LENGTH) throw new Error(`${label} must be ${MAX_NAME_LENGTH} characters or fewer`);
  return text;
}

const today = () => new Date().toISOString().slice(0, 10);

function emptyData() {
  return { version: 2, activeProfileId: null, profiles: [] };
}

export function createStore(storage, programmeName, random = Math.random) {
  let guest = null; // in memory only, never written to storage

  function newProfileId() {
    return `p_${Math.floor(random() * 36 ** 8).toString(36).padStart(8, '0')}`;
  }

  function migrateLegacy() {
    try {
      const raw = storage.getItem(LEGACY_STORAGE_KEY);
      if (!raw) return null;
      const old = JSON.parse(raw);
      if (!old || old.version !== 1 || !old.learner) return null;
      const data = emptyData();
      const profile = {
        id: newProfileId(),
        name: old.learner.name,
        robotName: old.learner.robotName,
        candidateId: old.learner.candidateId,
        enlistedOn: old.learner.enlistedOn,
        level: DEFAULT_LEVEL,
        completed: Array.isArray(old.completed) ? old.completed : [],
        workshop: null,
      };
      data.profiles.push(profile);
      data.activeProfileId = profile.id;
      return data;
    } catch {
      return null;
    }
  }

  function read() {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && data.version === 2 && Array.isArray(data.profiles)) return data;
      }
    } catch {
      return emptyData();
    }
    const migrated = migrateLegacy();
    if (migrated) {
      write(migrated);
      return migrated;
    }
    return emptyData();
  }

  function write(data) {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function findProfile(data, id) {
    const p = data.profiles.find((x) => x.id === id);
    if (!p) throw new Error(`No such profile: ${id}`);
    return p;
  }

  return {
    load: read,

    listProfiles: () => read().profiles,

    getActive() {
      if (guest) return guest;
      const data = read();
      return data.profiles.find((p) => p.id === data.activeProfileId) ?? null;
    },

    createProfile({ name, robotName }) {
      const cleanName = cleanText(name, 'Candidate name');
      const cleanRobot = cleanText(robotName, 'Robot name');
      const data = read();
      if (data.profiles.length >= MAX_PROFILES) {
        throw new Error(`This browser can hold up to ${MAX_PROFILES} candidates`);
      }
      const profile = {
        id: newProfileId(),
        name: cleanName,
        robotName: cleanRobot,
        candidateId: makeCandidateId(programmeName, random),
        enlistedOn: today(),
        level: DEFAULT_LEVEL,
        completed: [],
        workshop: null,
      };
      data.profiles.push(profile);
      data.activeProfileId = profile.id;
      write(data);
      guest = null;
      return profile;
    },

    selectProfile(id) {
      const data = read();
      findProfile(data, id);
      data.activeProfileId = id;
      write(data);
      guest = null;
    },

    /** Visitor mode: full access, never saved. Gone on reload or when you leave. */
    startGuest(name = 'Guest') {
      guest = {
        id: 'guest',
        guest: true,
        name: String(name).trim().slice(0, MAX_NAME_LENGTH) || 'Guest',
        robotName: 'Guest bot',
        candidateId: null,
        level: DEFAULT_LEVEL,
        completed: [],
        workshop: null,
      };
      return guest;
    },

    /** Back to the "who's flying" screen. Deletes nobody. */
    leave() {
      guest = null;
      const data = read();
      if (data.activeProfileId !== null) {
        data.activeProfileId = null;
        write(data);
      }
    },

    updateProfile(id, patch) {
      for (const key of Object.keys(patch)) {
        if (!UPDATABLE.includes(key)) throw new Error(`Cannot change "${key}"`);
      }
      const apply = (target) => {
        if ('name' in patch) target.name = cleanText(patch.name, 'Candidate name');
        if ('robotName' in patch) target.robotName = cleanText(patch.robotName, 'Robot name');
        if ('level' in patch) {
          if (!isValidLevel(patch.level)) throw new Error(`Invalid level: ${patch.level}`);
          target.level = patch.level;
        }
        if ('completed' in patch) {
          if (!Array.isArray(patch.completed)) throw new Error('completed must be a list');
          target.completed = patch.completed;
        }
        if ('workshop' in patch) target.workshop = patch.workshop;
        return target;
      };
      if (id === 'guest' && guest) return apply(guest);
      const data = read();
      const updated = apply(findProfile(data, id));
      write(data);
      return updated;
    },

    deleteProfile(id) {
      const data = read();
      findProfile(data, id);
      data.profiles = data.profiles.filter((p) => p.id !== id);
      if (data.activeProfileId === id) data.activeProfileId = null;
      write(data);
    },

    reset() {
      guest = null;
      storage.removeItem(STORAGE_KEY);
    },
  };
}
