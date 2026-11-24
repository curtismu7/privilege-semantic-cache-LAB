import test from 'node:test';
import assert from 'node:assert/strict';
import { BOUNDS } from '../src/bounds.js';
import { startLab } from './helpers.js';

// The routes the web page adds: a store outage toggle, the provider's state, and a read-only similarity score.
test('PUT /api/store switches one vector store off and on; the run then ends in the named error and the key view shows the state', async () => {
  const lab = await startLab();
  try {
    const down = await lab.send('PUT', '/api/store', { store: 'vector-redis-a', available: false });
    assert.equal(down.status, 200);
    assert.equal(down.json.stores.find((s) => s.id === 'vector-redis-a').available, false);
    assert.equal(down.json.stores.find((s) => s.id === 'vector-redis-b').available, true);
    const run = (await lab.send('POST', '/api/run', { prompt: 'Is the store down right now?' })).json;
    assert.equal(run.outcome, 'error'); assert.equal(run.error.code, 'vector_store_unavailable'); assert.equal(run.error.status, 503);
    assert.equal((await lab.get('/api/usage')).json.requests, 0, 'no Usage for an outage');
    assert.equal((await lab.get('/api/key')).json.stores.find((s) => s.id === 'vector-redis-a').available, false);
    assert.equal((await lab.send('PUT', '/api/store', { store: 'vector-redis-a', available: true })).json.stores[0].available, true);
    assert.equal((await lab.send('POST', '/api/run', { prompt: 'Is the store down right now?' })).json.outcome, 'miss');
  } finally { await lab.close(); }
});

test('PUT /api/store is bounded: unknown store, non-boolean, extra fields and prototype keys are named 400s', async () => {
  const lab = await startLab();
  try {
    const bad = [{ store: 'nope', available: false }, { store: 'vector-redis-a', available: 'no' }, { store: 5, available: true }, { available: true }, { store: 'vector-redis-a' }, { store: 'vector-redis-a', available: true, x: 1 }, [], '{"__proto__":{"available":false}}', '{"store":"__proto__","available":true}'];
    for (const b of bad) { const r = await lab.send('PUT', '/api/store', b); assert.equal(r.status, 400, JSON.stringify(b)); assert.match(r.json.error, /^(invalid_request|bad_json)$/); }
  } finally { await lab.close(); }
});

test('PUT /api/provider sets the mock provider\'s state; a miss then meets it, a hit does not', async () => {
  const lab = await startLab();
  try {
    assert.equal((await lab.get('/api/key')).json.providerState, 'healthy');
    assert.deepEqual((await lab.get('/api/key')).json.providerStates, ['healthy', 'down', 'overloaded', 'timeout', 'slow']);
    await lab.send('POST', '/api/run', { prompt: 'Cache this answer while healthy' });
    assert.equal((await lab.send('PUT', '/api/provider', { state: 'down' })).json.providerState, 'down');
    const hit = (await lab.send('POST', '/api/run', { prompt: 'Cache this answer while healthy' })).json;
    assert.equal(hit.outcome, 'hit', 'a hit makes no model call, so a down provider does not matter');
    const miss = (await lab.send('POST', '/api/run', { prompt: 'A brand new prompt about gardening' })).json;
    assert.equal(miss.outcome, 'error'); assert.equal(miss.error.code, 'provider_failed'); assert.equal(miss.error.status, 503); assert.equal(miss.stored, false);
    await lab.send('PUT', '/api/provider', { state: 'timeout' });
    const slow = (await lab.send('POST', '/api/run', { prompt: 'Another new prompt about astronomy' })).json;
    assert.equal(slow.error.status, 504);
  } finally { await lab.close(); }
});

test('PUT /api/provider refuses an unknown state, a non-string and extra fields', async () => {
  const lab = await startLab();
  try {
    for (const b of [{ state: 'on fire' }, { state: 5 }, {}, { state: 'down', x: 1 }, { state: '__proto__' }, []]) assert.equal((await lab.send('PUT', '/api/provider', b)).status, 400, JSON.stringify(b));
    assert.equal((await lab.get('/api/key')).json.providerState, 'healthy');
  } finally { await lab.close(); }
});

test('the new writes are same-origin only', async () => {
  const lab = await startLab();
  try {
    for (const [p, body] of [['/api/store', { store: 'vector-redis-a', available: false }], ['/api/provider', { state: 'down' }], ['/api/similarity', { a: 'aaa', b: 'bbb' }]]) {
      const method = p === '/api/similarity' ? 'POST' : 'PUT';
      assert.equal((await lab.send(method, p, body, { origin: 'http://evil.example' })).status, 403, p);
      assert.equal((await lab.send(method, p, body, { 'sec-fetch-site': 'cross-site' })).status, 403, p);
    }
    assert.equal((await lab.get('/api/key')).json.providerState, 'healthy');
  } finally { await lab.close(); }
});

test('POST /api/similarity scores a pair without touching the cache, the Usage or the clock', async () => {
  const lab = await startLab();
  try {
    const a = 'What are your opening hours on Sunday?'; const b = 'What time do you open on Sunday?';
    const r = await lab.send('POST', '/api/similarity', { a, b });
    assert.equal(r.status, 200);
    assert.ok(r.json.similarity >= 0.45 && r.json.similarity < 0.6, String(r.json.similarity));
    assert.match(r.json.encoder, /not a real embedding model/);
    assert.equal((await lab.send('POST', '/api/similarity', { a, b: a })).json.similarity, 1);
    const other = await lab.send('POST', '/api/similarity', { a, b, embeddingModel: 'lab-embed-d' });
    assert.notEqual(other.json.similarity, r.json.similarity, 'another embedding model is another encoder');
    const u = (await lab.get('/api/usage')).json;
    assert.deepEqual([u.requests, u.fromCache, u.saved, u.clockMs], [0, 0, 0, 0]);
    assert.equal((await lab.get('/api/key')).json.entries, 0);
  } finally { await lab.close(); }
});

test('POST /api/similarity is bounded: empty, over-long, no-letter prompts, unknown models and extra fields are 400s', async () => {
  const lab = await startLab();
  try {
    const long = 'x'.repeat(BOUNDS.maxPromptChars + 1);
    for (const [b, error] of [[{ a: '', b: 'x' }, 'invalid_prompt'], [{ a: 'x', b: long }, 'invalid_prompt'], [{ a: '???', b: 'abc' }, 'invalid_prompt'], [{ a: 'abc' }, 'invalid_prompt'], [{ a: 'a', b: 'b', embeddingModel: 'nope' }, 'invalid_request'], [{ a: 'a', b: 'b', extra: 1 }, 'invalid_request'], [[], 'invalid_request']]) {
      const r = await lab.send('POST', '/api/similarity', b);
      assert.deepEqual([r.status, r.json.error], [400, error], JSON.stringify(b).slice(0, 50));
    }
    assert.equal((await lab.send('POST', '/api/similarity', { a: 'x'.repeat(BOUNDS.maxPromptChars), b: 'y'.repeat(BOUNDS.maxPromptChars) })).status, 200, 'prompts at the limit work');
  } finally { await lab.close(); }
});
