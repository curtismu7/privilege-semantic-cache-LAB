import { createApp, startHttpServer } from '../src/app.js';
import { validateConfig } from '../src/customer.js';
import { createHealth } from '../src/health.js';
import { createClock } from '../src/model-gateway-sim/labClock.js';

export const newClock = (t = 0) => createClock(t);
export const code = (fn) => { try { fn(); } catch (e) { return e.code ?? e.name; } return null; };

// A running app (the default customer config, never the author's own file) on an ephemeral loopback port with a quiet health timer and no stdout
// lines (pass `log` to capture them). Returns { base, get, send, close }.
export async function startLab({ log = () => {}, now, distDir, customer, env } = {}) {
  const health = createHealth({ demoId: 'test', demoName: 'test', runChecks: () => [], allPassed: () => true, intervalMs: 3_600_000 });
  const app = createApp({ health, log, ...(env ? { env } : {}), ...(now ? { now } : {}), ...(distDir ? { distDir } : {}), customer: customer ?? validateConfig({}) });
  const { server, url } = await startHttpServer({ port: 0, host: '127.0.0.1', app });
  const base = url.replace(/\/$/, '');
  const call = async (method, path, body, headers = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(method !== 'GET' ? { origin: base } : {}), ...headers },
      body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
    });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text, headers: res.headers };
  };
  return {
    base,
    get: (p, h) => call('GET', p, undefined, h),
    send: call,
    close: async () => { health.stop(); await new Promise((r) => server.close(r)); },
  };
}
