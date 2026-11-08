// Runs Pyodide off the main thread, so a stuck loop can be stopped by throwing the worker away.
// Messages in:  { type: 'init', baseUrl }   { type: 'run', id, code, ctx }
// Messages out: { type: 'ready' }  { type: 'result', id, result }  { type: 'fatal', message }

import { runPython } from './exec.js';

let pyodide = null;

self.onmessage = async (event) => {
  const msg = event.data;
  try {
    if (msg.type === 'init') {
      const { loadPyodide } = await import(`${msg.baseUrl}pyodide.mjs`);
      pyodide = await loadPyodide({ indexURL: msg.baseUrl });
      self.postMessage({ type: 'ready' });
    } else if (msg.type === 'run') {
      const result = await runPython(pyodide, msg.code, msg.ctx);
      self.postMessage({ type: 'result', id: msg.id, result });
    }
  } catch (err) {
    self.postMessage({ type: 'fatal', id: msg.id, message: String(err?.message ?? err) });
  }
};
