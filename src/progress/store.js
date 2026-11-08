// Progress store. Pure logic with an injectable storage so it runs in node tests.
// Learner data lives only in the browser (localStorage). Nothing is sent anywhere.

export const STORAGE_KEY = 'jadzia.progress.v1';

const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1

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

export function emptyProgress() {
  return { version: 1, learner: null, completed: [] };
}

export function createStore(storage, programmeName, random = Math.random) {
  function load() {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return emptyProgress();
      const data = JSON.parse(raw);
      if (!data || data.version !== 1) return emptyProgress();
      return data;
    } catch {
      return emptyProgress();
    }
  }

  function save(data) {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function enlist(name, robotName) {
    const cleanName = String(name || '').trim();
    const cleanRobot = String(robotName || '').trim();
    if (!cleanName) throw new Error('Candidate name is required');
    if (!cleanRobot) throw new Error('Robot name is required');
    const data = load();
    data.learner = {
      name: cleanName,
      robotName: cleanRobot,
      candidateId: makeCandidateId(programmeName, random),
      enlistedOn: new Date().toISOString().slice(0, 10),
    };
    save(data);
    return data.learner;
  }

  function reset() {
    storage.removeItem(STORAGE_KEY);
  }

  return { load, enlist, reset };
}
