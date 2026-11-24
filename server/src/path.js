// The request path: prompt -> guard decision -> cache lookup -> hit returns the cached answer; miss calls the kit's provider stub and
// stores the answer with the key's TTL. Guard order relative to the lookup is UNVERIFIED (the lab runs the guard first and says so).
import { createKeyCache, createVectorStores, SAVED_UNIT, validatePrompt } from './cache.js';
import { LabError } from './errors.js';
import { createClock } from './model-gateway-sim/labClock.js';
import { createProvider } from './model-gateway-sim/providerStub.js';

export function createLab({ replyTokens = 120, latencyMs = 400 } = {}) {
  const clock = createClock(0);
  const stores = createVectorStores();
  const provider = createProvider({ id: 'lab-provider', model: 'lab-model', latencyMs, replyTokens }, clock);
  const keys = new Map();
  return {
    clock, stores, provider,
    addKey(id, config) {
      if (keys.has(id)) throw new LabError('invalid_request', `key "${String(id).slice(0, 40)}" already exists`);
      const cache = createKeyCache({ id, config, clock, stores });
      keys.set(id, cache);
      return cache;
    },
    key(id) {
      const k = keys.get(id);
      if (!k) throw new LabError('unknown_key', `no such key: ${String(id).slice(0, 40)}`, 404);
      return k;
    },
    keyIds: () => [...keys.keys()],
  };
}

export function usageView(cache) {
  const { requests, fromCache, savedTokens } = cache.usage.snapshot();
  return { key: cache.id, requests, fromCache, saved: savedTokens, savedUnit: SAVED_UNIT };
}

// Runs one prompt through one key. Never throws for a lab outcome: a blocked prompt, a store outage and a provider failure are results.
// Bad input (no prompt, too long) throws a LabError (a 400 at the API).
export function runPrompt(lab, keyId, { prompt, guardBlocked = false } = {}) {
  const cache = lab.key(keyId);
  validatePrompt(prompt);
  const trace = [];
  const at = () => lab.clock.now();
  const done = (r) => ({ key: keyId, config: cache.getConfig(), trace, clockMs: at(), usage: usageView(cache), ...r });

  // The caller's guard decision. A blocked prompt is neither looked up, nor sent to the provider, nor stored.
  if (guardBlocked) {
    trace.push({ hop: 'guard', atMs: at(), result: 'blocked' });
    return done({ outcome: 'blocked', servedBy: null, answer: null, similarity: null, matched: null, stored: false, error: { code: 'guard_blocked', message: 'a guard blocked this prompt before the cache (the lab\'s model of the order, UNVERIFIED)' } });
  }
  trace.push({ hop: 'guard', atMs: at(), result: 'passed' });

  let found;
  try {
    found = cache.lookup(prompt);
  } catch (e) {
    if (!(e instanceof LabError) || e.code !== 'vector_store_unavailable') throw e;
    trace.push({ hop: 'lookup', atMs: at(), result: 'error', code: e.code });
    // The lab shows the named error and makes no model call. That is not a claim that the product fails closed or open: UNVERIFIED.
    return done({ outcome: 'error', servedBy: null, answer: null, similarity: null, matched: null, stored: false, error: { code: e.code, message: e.message, status: e.status, note: 'UNVERIFIED which behaviour the product has; the lab claims neither fail-open nor fail-closed' } });
  }
  trace.push({ hop: 'lookup', atMs: at(), result: found.hit ? 'hit' : 'miss', similarity: found.similarity, threshold: found.threshold });

  if (found.hit) {
    return done({ outcome: 'hit', servedBy: 'cache', answer: found.matched.answer, similarity: found.similarity, nearest: found.nearest, matched: found.matched, stored: false, error: null });
  }

  const reply = lab.provider.call({ prompt });
  trace.push({ hop: 'provider', atMs: at(), result: reply.ok ? 'ok' : 'failed', status: reply.status, latencyMs: reply.latencyMs });
  if (!reply.ok) {
    return done({ outcome: 'error', servedBy: null, answer: null, similarity: found.similarity, nearest: found.nearest, matched: null, stored: false, error: { code: 'provider_failed', message: reply.error, status: reply.status, origin: reply.origin } });
  }
  const kept = cache.store(prompt, reply.text, reply.usage.outputTokens);
  trace.push({ hop: 'store', atMs: at(), result: 'stored', expiresAt: kept.expiresAt, evicted: kept.evicted });
  return done({ outcome: 'miss', servedBy: 'provider', answer: reply.text, similarity: found.similarity, nearest: found.nearest, matched: null, stored: true, expiresAt: kept.expiresAt, error: null });
}
