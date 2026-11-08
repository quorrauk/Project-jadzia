// Run a learner's code on a Pyodide instance. Shared by the browser worker and the node tests, so what the
// tests prove is the same code that runs in the page.

import { PRELUDE } from './prelude.js';

/**
 * @param pyodide  a loaded Pyodide instance
 * @param {string} code
 * @param ctx { installed: string[], switches: {name: {part, project}}, dimmerProject: string, readings: {id: {current, voltage, power}} }
 * @returns {{ output: string, truncated: boolean, error: null | {type, message, line}, actions: object[] }}
 */
export async function runPython(pyodide, code, ctx = {}) {
  const full = { installed: [], switches: {}, dimmerProject: 'Dimmer', readings: {}, ...ctx };
  pyodide.globals.set('__code', String(code));
  pyodide.globals.set('__ctx_json', JSON.stringify(full));
  const json = await pyodide.runPythonAsync(PRELUDE);
  return JSON.parse(json);
}
