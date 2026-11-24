import test from 'node:test';
import assert from 'node:assert/strict';
import dns from 'node:dns';
import net from 'node:net';
import { installNetguard, netguardSelfTest } from '../src/netguard.js';
import { createApp, startHttpServer } from '../src/app.js';
import { SCENARIOS, runScenario } from '../src/scenarios.js';
import { createLab, runPrompt } from '../src/path.js';

test('the netguard self-test: every outbound path is refused and recorded', async () => {
  const guard = installNetguard();
  const r = await netguardSelfTest();
  assert.equal(r.ok, true, r.detail);
  assert.equal(r.blocked, 6);
  assert.equal(guard.attempts.length, 0, 'self-test attempts are not counted as real');
  guard.restore();
});

test('a literal IP needs no name lookup: dns.lookup of an address (an opted-in bind) is answered locally, a name is still refused, and connecting to the address is still blocked', async () => {
  const guard = installNetguard();
  const lit = await new Promise((res, rej) => dns.lookup('192.0.2.7', (e, address) => (e ? rej(e) : res(address))));
  assert.equal(lit, '192.0.2.7');
  assert.equal((await dns.promises.lookup('2001:db8::7')).address, '2001:db8::7');
  assert.deepEqual(guard.attempts, [], 'a literal address is not an attempt to leave');
  await assert.rejects(() => dns.promises.lookup('self-test.invalid'), /network blocked/);
  assert.deepEqual(guard.attempts, ['dns:self-test.invalid']);
  guard.attempts.length = 0;
  assert.throws(() => net.connect({ host: '192.0.2.7', port: 80 }).on('error', () => {}), /network blocked/);
  assert.deepEqual(guard.attempts, ['socket:192.0.2.7'], 'the connect to a literal IP is still refused and recorded');
  guard.restore();
});

test('a full run of every scenario, the request path and the HTTP API makes zero outbound attempts', async () => {
  const guard = installNetguard();
  for (const sc of SCENARIOS) assert.equal(runScenario(sc.id).ok, true);
  const lab = createLab(); lab.addKey('k', { embeddingModel: 'lab-embed-a', vectorRedis: 'vector-redis-a', strictness: 0.7, ttlMs: 1000 });
  runPrompt(lab, 'k', { prompt: 'a prompt' }); runPrompt(lab, 'k', { prompt: 'a prompt' });
  const { server, url } = await startHttpServer({ port: 0, host: '127.0.0.1', app: createApp() });
  try {
    const base = url.replace(/\/$/, '');
    assert.equal((await fetch(`${base}/api/health`)).status, 200); // loopback is allowed
    assert.equal((await fetch(`${base}/api/scenario/exact-repeat-hits`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: '{}' })).status, 200);
  } finally { await new Promise((r) => server.close(r)); }
  assert.deepEqual(guard.attempts, []);
  await assert.rejects(() => fetch('http://self-test.invalid/'), /network blocked/);
  assert.equal(guard.attempts.length, 1, 'and the guard does record a real attempt');
  guard.restore();
});
