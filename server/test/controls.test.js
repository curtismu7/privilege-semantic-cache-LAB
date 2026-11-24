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

test('after the TTL both views agree: the store card and GET /api/key say 0 live entries', async () => {
  const lab = await startLab();
  try {
    await lab.send('POST', '/api/run', { prompt: 'Something to keep for a while' });
    const before = (await lab.get('/api/key')).json;
    assert.deepEqual([before.entries, before.stores.find((s) => s.id === 'vector-redis-a').entries], [1, 1]);
    await lab.send('POST', '/api/clock/advance', { ms: 3_600_000 });
    const after = (await lab.get('/api/key')).json;
    assert.deepEqual([after.entries, after.stores.find((s) => s.id === 'vector-redis-a').entries], [0, 0]);
  } finally { await lab.close(); }
});

test('POST /api/similarity takes two prompts at the limit even when every character is escaped (6 bytes each)', async () => {
  const lab = await startLab();
  try {
    const p = `${'\u0001'.repeat(BOUNDS.maxPromptChars - 1)}a`;
    assert.ok(JSON.stringify({ a: p, b: p }).length > BOUNDS.maxBodyBytes, 'more than the general body limit');
    const r = await lab.send('POST', '/api/similarity', { a: p, b: p });
    assert.equal(r.status, 200);
    assert.equal(r.json.similarity, 1);
    const big = await lab.send('POST', '/api/similarity', { a: p, b: p, extra: 'x'.repeat(BOUNDS.maxSimilarityBodyBytes) });
    assert.equal(big.status, 413);
    assert.equal((await lab.send('POST', '/api/run', { prompt: p })).status, 200, 'one prompt at the limit still fits the general limit');
  } finally { await lab.close(); }
});

test('a workspace the server had to build is announced with X-Workspace-Fresh; a known one is not; after the cap forgets one it is announced again', async () => {
  const lab = await startLab();
  try {
    const fresh = (r) => r.headers.get('x-workspace-fresh');
    assert.equal(fresh(await lab.get('/api/key', { 'x-workspace': 'w0' })), '1');
    assert.equal(fresh(await lab.get('/api/key', { 'x-workspace': 'w0' })), null);
    for (let i = 1; i < 21; i++) await lab.get('/api/key', { 'x-workspace': `w${i}` }); // 21 others: the cap (20) forgets the least recently used, w0
    assert.equal(fresh(await lab.get('/api/key', { 'x-workspace': 'w0' })), '1', 'w0 was forgotten and rebuilt');
    assert.equal(fresh(await lab.get('/api/key', { 'x-workspace': 'w20' })), null, 'a recently used one stays');
    // after a Reset the next call rebuilds on purpose (the page expects it)
    await lab.send('POST', '/api/reset', {}, { 'x-workspace': 'w20' });
    assert.equal(fresh(await lab.get('/api/key', { 'x-workspace': 'w20' })), '1');
  } finally { await lab.close(); }
});

const FRANCE = 'What is the capital of France?'; const POEM = 'Write a poem about autumn leaves';

test('one score for the lookup and the Similarity card: a pair whose raw cosine is negative scores 0 in both, and strictness 0 is a HIT in both', async () => {
  const { cosine, embed, cacheScore } = await import('../src/encoder.js');
  assert.ok(cosine(embed('lab-embed-a', FRANCE), embed('lab-embed-a', POEM)) < 0, 'the pair really has a negative raw cosine');
  assert.equal(cacheScore(embed('lab-embed-a', FRANCE), embed('lab-embed-a', POEM)), 0);
  const lab = await startLab();
  try {
    const card = await lab.send('POST', '/api/similarity', { a: FRANCE, b: POEM, embeddingModel: 'lab-embed-a' });
    assert.equal(card.json.similarity, 0);
    assert.equal((await lab.send('PUT', '/api/key', { strictness: 0 })).status, 200);
    await lab.send('POST', '/api/run', { prompt: FRANCE });
    const run = (await lab.send('POST', '/api/run', { prompt: POEM })).json;
    assert.equal(run.outcome, 'hit');
    assert.equal(run.similarity, card.json.similarity, 'the run produces exactly the score the card showed');
  } finally { await lab.close(); }
});

test('a request that will be refused creates nothing: the workspace is built only by the first valid call', async () => {
  const lab = await startLab();
  try {
    const refused = [
      ['POST', '/api/run', { prompt: '' }], ['POST', '/api/run', { prompt: '???' }], ['POST', '/api/run', { prompt: 'a', guardBlocked: 'yes' }], ['POST', '/api/scenario/nope', {}],
      ['PUT', '/api/key', { strictness: 5 }], ['PUT', '/api/key', {}], ['PUT', '/api/store', { store: 'nope', available: true }], ['PUT', '/api/provider', { state: 'on fire' }],
      ['POST', '/api/clock/advance', { ms: -1 }], ['POST', '/api/similarity', { a: '', b: 'x' }], ['POST', '/api/similarity', { a: 'x', b: 'y', embeddingModel: 'nope' }],
    ];
    let i = 0;
    for (const [method, path, body] of refused) {
      const ws = `refused-${i++}`;
      const r = await lab.send(method, path, body, { 'x-workspace': ws });
      assert.ok(r.status >= 400 && r.status < 500, `${method} ${path} ${JSON.stringify(body)} -> ${r.status}`);
      assert.equal(r.headers.get('x-workspace-fresh'), null, 'a refusal builds no workspace');
      assert.equal((await lab.get('/api/key', { 'x-workspace': ws })).headers.get('x-workspace-fresh'), '1', `${path}: the first valid call builds it`);
    }
    // and a flood of refused requests with new ids evicts nobody
    await lab.send('PUT', '/api/key', { strictness: 0.3 }, { 'x-workspace': 'keeper' });
    for (let k = 0; k < 30; k++) await lab.send('POST', '/api/run', { prompt: '' }, { 'x-workspace': `flood-${k}` });
    assert.equal((await lab.get('/api/key', { 'x-workspace': 'keeper' })).json.config.strictness, 0.3);
  } finally { await lab.close(); }
});

test('the 413 message names the limit of the route that refused: 131072 for the general limit, the larger one for /api/similarity', async () => {
  const lab = await startLab();
  try {
    const general = await lab.send('POST', '/api/run', { prompt: 'x'.repeat(BOUNDS.maxBodyBytes + 10) });
    assert.equal(general.status, 413);
    assert.match(general.json.message, new RegExp(`over ${BOUNDS.maxBodyBytes} bytes`));
    const sim = await lab.send('POST', '/api/similarity', { a: 'x', b: 'y', pad: 'x'.repeat(BOUNDS.maxSimilarityBodyBytes) });
    assert.equal(sim.status, 413);
    assert.match(sim.json.message, new RegExp(`over ${BOUNDS.maxSimilarityBodyBytes} bytes`));
  } finally { await lab.close(); }
});
