import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp, startHttpServer } from '../server/src/app.js';
import { validateConfig } from '../server/src/customer.js';
import { createHealth } from '../server/src/health.js';
import { reset } from './reset.mjs';

async function lab() {
  const health = createHealth({ demoId: 'test', demoName: 'test', runChecks: () => [], allPassed: () => true, intervalMs: 3_600_000 });
  const { server, url } = await startHttpServer({ port: 0, host: '127.0.0.1', app: createApp({ health, customer: validateConfig({}), log: () => {} }) });
  const base = url.replace(/\/$/, '');
  const run = (ws) => fetch(`${base}/api/run`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base, 'x-workspace': ws }, body: JSON.stringify({ prompt: 'a prompt for the reset test' }) });
  const requests = async (ws) => (await (await fetch(`${base}/api/usage`, { headers: { 'x-workspace': ws } })).json()).requests;
  return { base, run, requests, stop: () => { health.stop(); return new Promise((r) => server.close(r)); } };
}

test('npm run reset takes a workspace id: it clears that workspace only, and the default when none is given', async () => {
  const l = await lab();
  try {
    await l.run('default'); await l.run('alpha'); await l.run('beta');
    assert.deepEqual([await l.requests('default'), await l.requests('alpha'), await l.requests('beta')], [1, 1, 1]);
    const a = await reset(l.base, 'alpha');
    assert.deepEqual([a.reset, a.workspace, a.cleared], ['ok', 'alpha', 1]);
    assert.deepEqual([await l.requests('default'), await l.requests('alpha'), await l.requests('beta')], [1, 0, 1]);
    assert.equal((await reset(l.base)).workspace, 'default');
    assert.deepEqual([await l.requests('default'), await l.requests('beta')], [0, 1]);
  } finally { await l.stop(); }
});

test('reset refuses a bad workspace id and any host that is not loopback', async () => {
  await assert.rejects(() => reset('http://127.0.0.1:1', 'Bad Id'), /workspace must be/);
  await assert.rejects(() => reset('http://lab.example:7847', 'default'), /loopback only/);
});
