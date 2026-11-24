import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaces, validWorkspace, MAX_WORKSPACES } from '../src/workspaces.js';
import { startLab } from './helpers.js';

test('workspaces: default exists, ids are validated, the cap spares the default, reset gives the slot back', () => {
  const ws = createWorkspaces({ build: (id) => ({ id }), max: 2 });
  assert.equal(ws.get().id, 'default');
  ws.get('a'); ws.get('b');
  ws.get('a'); // a is now the most recently used
  assert.equal(ws.get('c').id, 'c');
  assert.deepEqual(ws.ids().sort(), ['a', 'c', 'default'], 'the least recently used (b) was forgotten, never a refusal, and the default stays');
  ws.reset('a');
  assert.deepEqual(ws.ids().sort(), ['c', 'default']);
  for (const bad of ['', 'A', '-x', 'a'.repeat(33), 'a b', '__proto__', 5, null]) assert.equal(validWorkspace(bad), false, String(bad));
  assert.throws(() => ws.get('Bad Id'), (e) => e.code === 'bad_workspace');
  assert.equal(MAX_WORKSPACES, 20);
});

test('the key, the cache, the clock and the last run are per workspace; Reset clears one only', async () => {
  const lab = await startLab();
  try {
    const w = (id) => ({ 'x-workspace': id });
    assert.equal((await lab.send('PUT', '/api/key', { strictness: 0.2 }, w('alpha'))).status, 200);
    assert.equal((await lab.get('/api/key', w('alpha'))).json.config.strictness, 0.2);
    assert.equal((await lab.get('/api/key')).json.config.strictness, 0.7, 'the default workspace keeps its own key');
    await lab.send('POST', '/api/run', { prompt: 'a prompt for alpha only' }, w('alpha'));
    assert.equal((await lab.get('/api/key', w('alpha'))).json.clockMs, 400);
    assert.equal((await lab.get('/api/key')).json.clockMs, 0, 'the default clock did not move');
    assert.equal((await lab.get('/api/usage', w('alpha'))).json.requests, 1);
    assert.equal((await lab.get('/api/usage')).json.requests, 0);
    assert.equal((await lab.get('/api/run-observability')).json.record, null, 'the default workspace has no run');
    assert.ok((await lab.get('/api/run-observability', w('alpha'))).json.record);
    // The same prompt in the default workspace is a miss: the cache is not shared between workspaces.
    assert.equal((await lab.send('POST', '/api/run', { prompt: 'a prompt for alpha only' })).json.outcome, 'miss');
    const r = await lab.send('POST', '/api/reset', {}, w('alpha'));
    assert.equal(r.json.workspace, 'alpha'); assert.equal(r.json.cleared, 1);
    assert.equal((await lab.get('/api/run-observability', w('alpha'))).json.record, null);
    assert.equal((await lab.get('/api/key', w('alpha'))).json.config.strictness, 0.7, 'alpha is back to the default key');
    assert.equal((await lab.get('/api/usage')).json.requests, 1, 'the default workspace was not reset');
    assert.equal((await lab.get('/api/info', w('alpha'))).json.workspace, 'alpha');
  } finally { await lab.close(); }
});

test('a malformed X-Workspace is a 400 with a message, never silently the default; past the cap the oldest workspace is forgotten, not a lock-out', async () => {
  const lab = await startLab();
  try {
    for (const bad of ['Bad Id', '../x', 'A', 'a'.repeat(40)]) {
      const r = await lab.get('/api/key', { 'x-workspace': bad });
      assert.deepEqual([r.status, r.json.error], [400, 'bad_workspace'], bad);
    }
    await lab.send('PUT', '/api/key', { strictness: 0.1 }, { 'x-workspace': 'w0' }); // w0 is the oldest
    for (let i = 1; i < MAX_WORKSPACES; i++) assert.equal((await lab.get('/api/key', { 'x-workspace': `w${i}` })).status, 200);
    assert.equal((await lab.get('/api/key', { 'x-workspace': 'one-too-many' })).status, 200, 'a new tab past the cap is admitted');
    assert.equal((await lab.get('/api/key', { 'x-workspace': 'w0' })).json.config.strictness, 0.7, 'the oldest workspace (w0) was forgotten: it starts fresh');
    assert.equal((await lab.get('/api/key')).status, 200, 'the default workspace is always admitted');
    assert.equal((await lab.send('POST', '/api/reset', {}, { 'x-workspace': 'w5' })).status, 200);
  } finally { await lab.close(); }
});
