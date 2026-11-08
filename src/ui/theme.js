// Themes: NASA (default), Light, T2, Quantum Leap. Colours and effects live in themes.css, keyed on body[data-theme].
// The choice is kept per browser, and also on the active profile so each candidate gets their own look.

export const THEMES = [
  { id: 'nasa', name: 'NASA' },
  { id: 'light', name: 'Light' },
  { id: 't2', name: 'T2' },
  { id: 'quantum-leap', name: 'Quantum Leap' },
];
export const DEFAULT_THEME = 'nasa';
export const THEME_KEY = 'jadzia.theme';

export const isTheme = (id) => THEMES.some((t) => t.id === id);

export function loadDeviceTheme(storage) {
  try {
    const v = storage.getItem(THEME_KEY);
    return isTheme(v) ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveDeviceTheme(storage, id) {
  try {
    storage.setItem(THEME_KEY, id);
  } catch {
    // Private browsing: the theme just won't be remembered.
  }
}

export function applyTheme(doc, id) {
  doc.body.dataset.theme = isTheme(id) ? id : DEFAULT_THEME;
}

/** Builds the drop-down. Returns { element, set(id) }. */
export function createThemePicker(doc, { current, onChange }) {
  const wrap = doc.createElement('label');
  wrap.className = 'theme-picker';
  const text = doc.createElement('span');
  text.textContent = 'Theme';
  const select = doc.createElement('select');
  select.setAttribute('data-testid', 'theme-select');
  for (const t of THEMES) {
    const o = doc.createElement('option');
    o.value = t.id;
    o.textContent = t.name;
    select.append(o);
  }
  select.value = isTheme(current) ? current : DEFAULT_THEME;
  select.addEventListener('change', () => onChange(select.value));
  wrap.append(text, select);
  return { element: wrap, set: (id) => { select.value = isTheme(id) ? id : DEFAULT_THEME; } };
}
