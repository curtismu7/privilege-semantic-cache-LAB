// Preflight: the same checks GET /api/health reports from (one per scenario, with its expected result, the stories and the diagram), plus the netguard self-test,
// a real pass through the HTTP API on a throwaway loopback port, and whether the lab's port is free. Prints only pass/fail lines.
// Exit 1 on failure.
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => import(pathToFileURL(path.join(root, p)));
const { installNetguard, netguardSelfTest } = await load('server/src/netguard.js');
const guard = installNetguard();

const { runChecks } = await load('server/src/checks.js');
let failed = 0;
const report = (level, name, detail) => { if (level === 'fail') failed++; console.log(`${level.toUpperCase().padEnd(4)}  ${name}: ${detail}`); };
for (const c of runChecks()) report(c.level, c.id, c.detail);

const self = await netguardSelfTest();
report(self.ok ? 'pass' : 'fail', 'netguard-self-test', self.ok ? `${self.blocked} outbound attempts were refused and recorded` : self.detail);

try {
  const { createApp, startHttpServer } = await load('server/src/app.js');
  const { SCENARIOS } = await load('server/src/scenarios.js');
  const { validateConfig } = await load('server/src/customer.js'); // the doctor never reads the author's own customer.config.json
  const app = createApp({ customer: validateConfig({}), log: () => {} }); // no stdout lines from the doctor's own runs
  const { server, url } = await startHttpServer({ port: 0, host: '127.0.0.1', app });
  try {
    const base = url.replace(/\/$/, '');
    const h = { 'content-type': 'application/json', origin: base };
    const send = async (method, p, body) => { const r = await fetch(`${base}${p}`, { method, headers: h, body: JSON.stringify(body ?? {}) }); return { status: r.status, json: await r.json() }; };
    const post = (p, body) => send('POST', p, body);
    const health = await (await fetch(`${base}/api/health`)).json();
    report(health.schema === 'demo-health/1' ? 'pass' : 'fail', 'http-health', `schema ${health.schema}`);
    const info = await (await fetch(`${base}/api/info`)).json();
    report(info.source === 'mock' && info.realAvailable === false ? 'pass' : 'fail', 'http-info', 'mock, Real not available');
    const live = await post('/api/mode', { source: 'live' });
    report(live.status === 409 ? 'pass' : 'fail', 'http-mode', `a switch to live is refused (${live.status})`);
    for (const sc of SCENARIOS) {
      const r = await post(`/api/scenario/${sc.id}`);
      report(r.status === 200 && r.json.ok ? 'pass' : 'fail', `http-scenario:${sc.id}`, `${r.json.checks?.length ?? 0} expected results through the API`);
    }
    const bad = await send('PUT', '/api/key', { strictness: 1.5 });
    report(bad.status === 400 && bad.json.error === 'invalid_config' ? 'pass' : 'fail', 'http-bad-config', 'a strictness outside 0 to 1 is refused with a named error');
    const empty = await post('/api/run', { prompt: '' });
    report(empty.status === 400 && empty.json.error === 'invalid_prompt' ? 'pass' : 'fail', 'http-empty-prompt', 'an empty prompt is refused with a named error');
    const first = await post('/api/run', { prompt: 'How do I reset my password?' });
    const again = await post('/api/run', { prompt: 'How do I reset my password?' });
    report(first.json.outcome === 'miss' && again.json.outcome === 'hit' && again.json.usage.fromCache === 1 ? 'pass' : 'fail', 'http-run', 'a repeat prompt is a miss, then a hit, and Usage counts it');
    const off = await send('PUT', '/api/store', { store: 'vector-redis-a', available: false });
    const outage = await post('/api/run', { prompt: 'Is the store down?' });
    report(off.status === 200 && outage.json.outcome === 'error' && outage.json.error.code === 'vector_store_unavailable' ? 'pass' : 'fail', 'http-store-outage', 'a store switched off gives the named error');
    const story = await (await fetch(`${base}/api/story`)).json();
    report(story.stories?.length === 9 && !/\{\{/.test(JSON.stringify(story)) ? 'pass' : 'fail', 'http-story', 'nine stories, no unfilled token');
    const dia = await (await fetch(`${base}/api/diagram?name=semantic-cache`)).json();
    report(dia.name === 'semantic-cache' && dia.steps?.length >= 6 ? 'pass' : 'fail', 'http-diagram', 'the diagram loads by name');
    const reset = await post('/api/reset');
    report(reset.json.reset === 'ok' ? 'pass' : 'fail', 'http-reset', `cleared ${reset.json.cleared} runs`);
  } finally { app.locals.health.stop(); await new Promise((res) => server.close(res)); }
} catch (e) { report('fail', 'http-cycle', `the HTTP pass could not run: ${String(e.message).slice(0, 100)}`); }

report(guard.attempts.length === 0 ? 'pass' : 'fail', 'zero-outbound', `${guard.attempts.length} real outbound attempts during the doctor run`);

const port = Number(process.env.PORT) || 7847;
await new Promise((resolve) => {
  const s = net.createServer();
  s.once('error', (e) => { report('fail', 'port-free', `${port} is not free (${e.code})`); resolve(); });
  s.listen(port, '127.0.0.1', () => s.close(() => { report('pass', 'port-free', `${port} is free (7847 is PROVISIONAL: claimed provisionally, not registered)`); resolve(); }));
});
process.exit(failed ? 1 : 0);
