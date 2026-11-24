import test from 'node:test';
import assert from 'node:assert/strict';
import { createLab, runPrompt, usageView } from '../src/path.js';
import { SAVED_UNIT } from '../src/cache.js';
import { BOUNDS } from '../src/bounds.js';
import { code } from './helpers.js';

const A = { embeddingModel: 'lab-embed-a', vectorRedis: 'vector-redis-a', strictness: 0.7, ttlMs: 60_000 };
const P = 'Give me a recipe for vegetable soup';
const lab1 = (opts) => { const lab = createLab(opts); lab.addKey('k', A); return lab; };

test('a miss calls the provider stub, stores the answer with the TTL and advances the lab clock by the call latency', () => {
  const lab = lab1({ latencyMs: 400 });
  const r = runPrompt(lab, 'k', { prompt: P });
  assert.equal(r.outcome, 'miss');
  assert.equal(r.servedBy, 'provider');
  assert.match(r.answer, /^\[lab-model\] answer to: Give me a recipe/);
  assert.equal(r.stored, true);
  assert.equal(r.clockMs, 400);
  assert.equal(r.expiresAt, 60_400);
  assert.deepEqual(r.trace.map((h) => h.hop), ['guard', 'lookup', 'provider', 'store']);
});

test('a hit returns the cached answer, makes no provider call and costs no lab time', () => {
  const lab = lab1();
  const first = runPrompt(lab, 'k', { prompt: P });
  const t = lab.clock.now();
  const hit = runPrompt(lab, 'k', { prompt: P });
  assert.equal(hit.outcome, 'hit');
  assert.equal(hit.servedBy, 'cache');
  assert.equal(hit.answer, first.answer);
  assert.equal(lab.clock.now(), t);
  assert.deepEqual(hit.trace.map((h) => h.hop), ['guard', 'lookup']);
  assert.equal(hit.similarity, 1);
});

test('Saved uses the stored answer\'s OUTPUT tokens, not the prompt\'s input tokens or a constant', () => {
  const lab = lab1({ replyTokens: 37 });
  runPrompt(lab, 'k', { prompt: 'a b c d e f g h i j k l m n o p' }); // 16 input tokens
  runPrompt(lab, 'k', { prompt: 'a b c d e f g h i j k l m n o p' });
  runPrompt(lab, 'k', { prompt: 'a b c d e f g h i j k l m n o p' });
  const u = usageView(lab.key('k'));
  assert.deepEqual([u.requests, u.fromCache, u.saved], [3, 2, 74]);
  assert.equal(u.savedUnit, SAVED_UNIT);
  assert.match(u.savedUnit, /UNVERIFIED/);
});

test('guard-blocked: no lookup, no provider call, nothing stored, no Usage, and the same text later is a miss', () => {
  const lab = lab1();
  const blocked = runPrompt(lab, 'k', { prompt: P, guardBlocked: true });
  assert.equal(blocked.outcome, 'blocked');
  assert.equal(blocked.stored, false);
  assert.equal(blocked.answer, null);
  assert.deepEqual(blocked.trace.map((h) => h.hop), ['guard']);
  assert.equal(lab.stores.size('vector-redis-a'), 0);
  assert.equal(lab.clock.now(), 0, 'no model call');
  assert.equal(usageView(lab.key('k')).requests, 0);
  assert.equal(runPrompt(lab, 'k', { prompt: P }).outcome, 'miss');
});

test('a guard-blocked prompt is not served from the cache either, even when the same text is cached', () => {
  const lab = lab1();
  runPrompt(lab, 'k', { prompt: P });
  const blocked = runPrompt(lab, 'k', { prompt: P, guardBlocked: true });
  assert.equal(blocked.outcome, 'blocked');
  assert.equal(blocked.answer, null);
});

test('the cache lets the caller skip the store: a lookup alone stores nothing', () => {
  const lab = lab1();
  lab.key('k').lookup(P);
  assert.equal(lab.stores.size('vector-redis-a'), 0);
});

test('a provider failure is a named error result and nothing is stored', () => {
  const lab = lab1();
  lab.provider.setState('down');
  const r = runPrompt(lab, 'k', { prompt: P });
  assert.equal(r.outcome, 'error');
  assert.equal(r.error.code, 'provider_failed');
  assert.equal(r.error.origin, 'provider');
  assert.equal(r.stored, false);
  assert.equal(lab.stores.size('vector-redis-a'), 0);
  lab.provider.setState('healthy');
  assert.equal(runPrompt(lab, 'k', { prompt: P }).outcome, 'miss');
});

test('a store outage is a named error result, with no provider call, no Usage and no claim about fail-open or fail-closed', () => {
  const lab = lab1();
  lab.stores.setAvailable('vector-redis-a', false);
  const r = runPrompt(lab, 'k', { prompt: P });
  assert.equal(r.outcome, 'error');
  assert.equal(r.error.code, 'vector_store_unavailable');
  assert.equal(r.error.status, 503);
  assert.match(r.error.note, /UNVERIFIED/);
  assert.match(r.error.note, /neither fail-open nor fail-closed/);
  assert.equal(r.servedBy, null);
  assert.equal(lab.clock.now(), 0);
  assert.equal(usageView(lab.key('k')).requests, 0);
});

test('hostile input throws a named error before anything runs; an unknown key is a 404-style error', () => {
  const lab = lab1();
  for (const prompt of ['', '  ', undefined, 7, 'x'.repeat(BOUNDS.maxPromptChars + 1)]) assert.equal(code(() => runPrompt(lab, 'k', { prompt })), 'invalid_prompt');
  assert.equal(code(() => runPrompt(lab, 'nope', { prompt: P })), 'unknown_key');
  assert.equal(code(() => runPrompt(lab, '__proto__', { prompt: P })), 'unknown_key');
  assert.equal(lab.clock.now(), 0);
});

test('a duplicate key id is refused', () => {
  const lab = lab1();
  assert.equal(code(() => lab.addKey('k', A)), 'invalid_request');
});

test('the result names the key config that was in force', () => {
  const lab = lab1();
  lab.key('k').setConfig({ strictness: 0.9 });
  assert.equal(runPrompt(lab, 'k', { prompt: P }).config.strictness, 0.9);
});
