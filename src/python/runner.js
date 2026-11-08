// Page side of the Python sandbox. One worker, started the first time it is needed and kept for the session.
// A run that goes over the time limit is stopped by terminating the worker; the next run starts a fresh one.

export const DEFAULTS = { timeoutMs: 5000, loadTimeoutMs: 90000 };

export function createRunner({ baseUrl, workerUrl, timeoutMs = DEFAULTS.timeoutMs, loadTimeoutMs = DEFAULTS.loadTimeoutMs, onStatus = () => {} }) {
  let worker = null;
  let ready = null; // Promise resolving when the worker has Pyodide loaded
  let nextId = 1;

  function start() {
    onStatus('loading');
    worker = new Worker(workerUrl, { type: 'module' });
    ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        stop();
        reject(new Error('load-timeout'));
      }, loadTimeoutMs);
      worker.addEventListener('message', function onMsg(e) {
        if (e.data.type === 'ready') {
          clearTimeout(timer);
          worker.removeEventListener('message', onMsg);
          onStatus('ready');
          resolve();
        } else if (e.data.type === 'fatal' && e.data.id === undefined) {
          clearTimeout(timer);
          stop();
          reject(new Error(e.data.message));
        }
      });
      worker.addEventListener('error', (e) => {
        clearTimeout(timer);
        stop();
        reject(new Error(e.message || 'worker-error'));
      });
      worker.postMessage({ type: 'init', baseUrl });
    });
    ready.catch(() => {});
  }

  function stop() {
    if (worker) worker.terminate();
    worker = null;
    ready = null;
  }

  /** @returns {Promise<{ ok: true, result } | { ok: false, reason: 'timeout' | 'load' | 'crash', message?: string }>} */
  async function run(code, ctx) {
    if (!worker) start();
    try {
      await ready;
    } catch (err) {
      onStatus('failed');
      return { ok: false, reason: 'load', message: err.message };
    }
    const w = worker;
    const id = nextId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        stop();
        onStatus('idle');
        resolve({ ok: false, reason: 'timeout' });
      }, timeoutMs);
      w.addEventListener('message', function onMsg(e) {
        if (e.data.id !== id) return;
        clearTimeout(timer);
        w.removeEventListener('message', onMsg);
        if (e.data.type === 'result') resolve({ ok: true, result: e.data.result });
        else resolve({ ok: false, reason: 'crash', message: e.data.message });
      });
      w.postMessage({ type: 'run', id, code, ctx });
    });
  }

  return { run, stop };
}
