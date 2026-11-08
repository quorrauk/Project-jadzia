// Component plugin registry. See docs/COMPONENTS.md for the plugin contract.

const plugins = new Map();

export function registerComponent(plugin) {
  if (!plugin || typeof plugin.type !== 'string' || !plugin.type) {
    throw new TypeError('Component plugin needs a string "type"');
  }
  for (const fn of ['stamp', 'readout']) {
    if (typeof plugin[fn] !== 'function') {
      throw new TypeError(`Component plugin "${plugin.type}" needs a ${fn}() function`);
    }
  }
  plugins.set(plugin.type, plugin);
}

export function getComponentPlugin(type) {
  return plugins.get(type);
}

export function componentTypes() {
  return [...plugins.keys()];
}
