import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = fileURLToPath(new URL('../../node_modules/pyodide/', import.meta.url));
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.zip': 'application/zip' };

// Serve the pinned Pyodide CDN URL from the npm copy, so tests need no internet. Returns a counter of files served.
export async function servePyodide(context) {
  const served = { count: 0 };
  await context.route('https://cdn.jsdelivr.net/pyodide/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    try {
      const body = await readFile(path.join(ROOT, name));
      served.count += 1;
      await route.fulfill({ status: 200, body, contentType: TYPES[path.extname(name)] ?? 'application/octet-stream', headers: { 'access-control-allow-origin': '*' } });
    } catch {
      await route.fulfill({ status: 404, body: 'not found', headers: { 'access-control-allow-origin': '*' } });
    }
  });
  return served;
}
