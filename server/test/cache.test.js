import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, STORE_IDS, createKeyCache, createVectorStores, validateConfig } from '../src/cache.js';
import { BOUNDS } from '../src/bounds.js';
import { newClock, code } from './helpers.js';

const A = { embeddingModel: 'lab-embed-a', vectorRedis: 'vector-redis-a', strictness: 0.7, ttlMs: 1000 };
const setup = (cfgs = { k: A }) => {
  const clock = newClock(0); const stores = createVectorStores();
  const keys = Object.fromEntries(Object.entries(cfgs).map(([id, c]) => [id, createKeyCache({ id, config: c, clock, stores })]));
  return { clock, stores, keys };
};
const P = 'How do I reset my password?';

test('an empty cache misses with no score and no nearest entry', () => {
  const { keys } = setup();
  const r = keys.k.lookup(P);
  assert.deepEqual([r.hit, r.similarity, r.matched, r.nearest], [false, null, null, null]);
});

test('an exact repeat hits with a score of 1 and the stored answer', () => {
  const { keys } = setup();
  keys.k.lookup(P); keys.k.store(P, 'the answer', 30);
  const r = keys.k.lookup(P);
  assert.equal(r.hit, true);
  assert.equal(r.similarity, 1);
  assert.equal(r.matched.answer, 'the answer');
});

test('threshold comparison: a score EQUAL to the strictness is a hit, a score just under it is a miss', () => {
  const { keys } = setup({ k: { ...A, strictness: 0 } });
  keys.k.store('Explain how photosynthesis works', 'x', 1);
  const score = keys.k.lookup('Can you explain how photosynthesis works?').similarity;
  assert.ok(score > 0.5 && score < 1);
  keys.k.setConfig({ strictness: score });
  assert.equal(keys.k.lookup('Can you explain how photosynthesis works?').hit, true, 'equal to the strictness hits');
  keys.k.setConfig({ strictness: score + 0.000001 });
  assert.equal(keys.k.lookup('Can you explain how photosynthesis works?').hit, false, 'just above the score misses');
  keys.k.setConfig({ strictness: 1 });
  assert.equal(keys.k.lookup('Explain how photosynthesis works').hit, true, 'strictness 1 still hits an exact repeat');
});

test('a miss still reports the nearest entry and its score', () => {
  const { keys } = setup();
  keys.k.store(P, 'a', 1);
  const r = keys.k.lookup('What is the capital of France?');
  assert.equal(r.hit, false);
  assert.ok(r.similarity < 0.7);
  assert.equal(r.nearest.prompt, P);
  assert.equal(r.matched, null);
});

test('TTL: an entry is live until storedAt + ttl and gone AT that moment (lab clock)', () => {
  const { clock, keys } = setup();
  clock.advance(500);
  const kept = keys.k.store(P, 'a', 1);
  assert.equal(kept.expiresAt, 1500);
  clock.set(1499);
  assert.equal(keys.k.lookup(P).hit, true);
  clock.set(1500);
  const r = keys.k.lookup(P);
  assert.equal(r.hit, false);
  assert.equal(r.similarity, null, 'the expired entry is gone, not just below the threshold');
  assert.equal(keys.k.entryCount(), 0);
});

test('a hit does not extend the TTL (the lab\'s own rule)', () => {
  const { clock, keys } = setup();
  keys.k.store(P, 'a', 1);
  clock.set(900); assert.equal(keys.k.lookup(P).hit, true);
  clock.set(1000); assert.equal(keys.k.lookup(P).hit, false);
});

test('a key never shares an answer with another key: different embedding model, same store', () => {
  const { keys } = setup({ a: A, b: { ...A, embeddingModel: 'lab-embed-b' } });
  keys.a.store(P, 'answer for a', 1);
  const r = keys.b.lookup(P);
  assert.deepEqual([r.hit, r.similarity, r.nearest], [false, null, null]);
});

test('a key never shares an answer with another key: same embedding model, different store', () => {
  const { keys } = setup({ a: A, c: { ...A, vectorRedis: 'vector-redis-b' } });
  keys.a.store(P, 'answer for a', 1);
  const r = keys.c.lookup(P);
  assert.deepEqual([r.hit, r.similarity], [false, null]);
  assert.equal(keys.a.lookup(P).hit, true);
});

test('lab model (UNVERIFIED scoping): two keys on the SAME store with the SAME embedding model still keep separate entries', () => {
  const { keys } = setup({ a: A, b: { ...A } });
  keys.a.store(P, 'answer for a', 1);
  const r = keys.b.lookup(P);
  assert.deepEqual([r.hit, r.similarity, r.nearest], [false, null, null]);
});

test('changing a key\'s embedding model leaves its old entries unmatched (they are in another vector space, so not even compared)', () => {
  const { keys } = setup();
  keys.k.store(P, 'a', 1);
  keys.k.setConfig({ embeddingModel: 'lab-embed-d', strictness: 0 });
  const r = keys.k.lookup(P);
  assert.deepEqual([r.hit, r.similarity], [false, null], 'no candidate at all, even at strictness 0');
  keys.k.setConfig({ strictness: 0.7 });
  keys.k.setConfig({ embeddingModel: 'lab-embed-a' });
  assert.equal(keys.k.lookup(P).hit, true);
});

test('Usage: Requests count every lookup, From cache counts hits, Saved is the stored answer\'s output tokens (not input tokens)', () => {
  const { keys } = setup();
  keys.k.lookup(P); keys.k.store(P, 'a', 77);           // request 1: miss
  keys.k.lookup(P);                                       // request 2: hit, saves 77
  keys.k.lookup('What is the capital of France?');        // request 3: miss
  keys.k.lookup(P);                                       // request 4: hit, saves 77
  assert.deepEqual(keys.k.usage.snapshot(), { requests: 4, fromCache: 2, savedTokens: 154 });
});

test('Usage is per key', () => {
  const { keys } = setup({ a: A, b: { ...A, vectorRedis: 'vector-redis-b' } });
  keys.a.store(P, 'a', 5); keys.a.lookup(P); keys.b.lookup(P);
  assert.deepEqual(keys.a.usage.snapshot(), { requests: 1, fromCache: 1, savedTokens: 5 });
  assert.deepEqual(keys.b.usage.snapshot(), { requests: 1, fromCache: 0, savedTokens: 0 });
});

test('a store outage is a NAMED error on lookup and on store, records no Usage, and recovers', () => {
  const { stores, keys } = setup();
  keys.k.store(P, 'a', 1);
  stores.setAvailable('vector-redis-a', false);
  for (const fn of [() => keys.k.lookup(P), () => keys.k.store(P, 'a', 1)]) {
    assert.throws(fn, (e) => e.code === 'vector_store_unavailable' && e.status === 503 && /vector-redis-a/.test(e.message));
  }
  assert.equal(keys.k.usage.snapshot().requests, 0);
  stores.setAvailable('vector-redis-a', true);
  assert.equal(keys.k.lookup(P).hit, true);
});

test('an outage on one store does not touch a key on another store', () => {
  const { stores, keys } = setup({ a: A, c: { ...A, vectorRedis: 'vector-redis-b' } });
  stores.setAvailable('vector-redis-a', false);
  assert.equal(keys.c.lookup(P).hit, false); // no throw
});

test(`entry count cap: a store keeps at most ${BOUNDS.maxEntriesPerStore} entries and evicts the oldest`, () => {
  const { stores, keys } = setup({ k: { ...A, ttlMs: 1_000_000 } });
  let evicted = 0;
  for (let i = 0; i < BOUNDS.maxEntriesPerStore + 20; i++) evicted += keys.k.store(`unique prompt number ${i} about topic ${'x'.repeat(i % 7)}`, 'a', 1).evicted;
  assert.equal(stores.size('vector-redis-a'), BOUNDS.maxEntriesPerStore);
  assert.equal(evicted, 20);
  keys.k.setConfig({ strictness: 1 }); // only an exact copy counts (the numbered prompts are all alike to the stand-in encoder)
  assert.equal(keys.k.lookup('unique prompt number 0 about topic ').hit, false, 'the oldest was evicted');
  assert.equal(keys.k.lookup(`unique prompt number ${BOUNDS.maxEntriesPerStore + 19} about topic ${'x'.repeat((BOUNDS.maxEntriesPerStore + 19) % 7)}`).hit, true);
});

test('hostile prompts are refused with a named error: empty, blank, non-string, huge, no letters', () => {
  const { keys } = setup();
  for (const bad of ['', '   ', '\n\t', null, undefined, 5, {}, ['a'], 'x'.repeat(BOUNDS.maxPromptChars + 1), '???', '😀😀']) {
    assert.equal(code(() => keys.k.lookup(bad)), 'invalid_prompt', String(bad).slice(0, 20));
  }
  assert.equal(code(() => keys.k.store('', 'a', 1)), 'invalid_prompt');
  assert.doesNotThrow(() => keys.k.lookup('x'.repeat(BOUNDS.maxPromptChars)));
  assert.equal(keys.k.usage.snapshot().requests, 1, 'refused prompts record no Usage');
});

test('config validation: strictness outside 0..1, zero or negative TTL, unknown model or store, prototype keys, odd types', () => {
  const bad = [
    { strictness: 1.0001 }, { strictness: -0.0001 }, { strictness: NaN }, { strictness: '0.5' }, { strictness: null }, { strictness: Infinity },
    { ttlMs: 0 }, { ttlMs: -1 }, { ttlMs: 1.5 }, { ttlMs: NaN }, { ttlMs: '1000' }, { ttlMs: BOUNDS.maxTtlMs + 1 },
    { embeddingModel: 'gpt-nope' }, { embeddingModel: '__proto__' }, { embeddingModel: 'constructor' }, { embeddingModel: 5 },
    { vectorRedis: 'redis-z' }, { vectorRedis: '__proto__' }, { vectorRedis: ['vector-redis-a'] },
    {}, [], null, 'x', 5, { extra: 1 }, { constructor: 1 }, JSON.parse('{"__proto__":{"strictness":0.1}}'),
  ];
  for (const b of bad) assert.equal(code(() => validateConfig(b)), 'invalid_config', JSON.stringify(b));
  assert.deepEqual(validateConfig({ strictness: 0 }).strictness, 0);
  assert.deepEqual(validateConfig({ strictness: 1 }).strictness, 1);
  assert.equal(validateConfig({ ttlMs: 1 }).ttlMs, 1);
  assert.deepEqual(validateConfig({ vectorRedis: STORE_IDS[2] }).vectorRedis, STORE_IDS[2]);
  assert.deepEqual({ ...DEFAULT_CONFIG }, validateConfig({ ttlMs: DEFAULT_CONFIG.ttlMs }));
});

test('a refused config change leaves the old config in place', () => {
  const { keys } = setup();
  assert.throws(() => keys.k.setConfig({ strictness: 5 }));
  assert.equal(keys.k.getConfig().strictness, 0.7);
});

test('a prototype-pollution probe does not pollute', () => {
  assert.throws(() => validateConfig(JSON.parse('{"__proto__":{"polluted":true}}')));
  assert.equal({}.polluted, undefined);
});
