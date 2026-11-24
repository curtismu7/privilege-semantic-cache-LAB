// The per-key semantic cache and its vector-store stand-ins. Everything here is the lab's own model, UNVERIFIED against the product
// beyond what the 2026-11-21 release notes say (each key names an embedding model and a vector Redis, a match strictness and a TTL;
// the Usage view shows Requests, From cache, Saved). All time is the kit's lab clock.
import { BOUNDS } from './bounds.js';
import { cosine, embed, isEmbeddingModel, EMBEDDING_MODEL_IDS } from './encoder.js';
import { invalidConfig, invalidPrompt, storeUnavailable } from './errors.js';
import { createLlmKey } from './model-gateway-sim/llmKey.js';

export const STORE_IDS = Object.freeze(['vector-redis-a', 'vector-redis-b', 'vector-redis-c']);
export const DEFAULT_CONFIG = Object.freeze({ embeddingModel: 'lab-embed-a', vectorRedis: 'vector-redis-a', strictness: 0.7, ttlMs: 60_000 });
export const SAVED_UNIT = 'lab-model tokens (the stored answer\'s output tokens), UNVERIFIED against the product\'s Usage view';
const CONFIG_FIELDS = Object.keys(DEFAULT_CONFIG);

export function validatePrompt(prompt) {
  if (typeof prompt !== 'string') throw invalidPrompt('prompt must be a string');
  if (prompt.length > BOUNDS.maxPromptChars) throw invalidPrompt(`prompt is over ${BOUNDS.maxPromptChars} characters`);
  if (!prompt.trim()) throw invalidPrompt('prompt is empty');
  return prompt;
}

// A full config from a partial one. Unknown fields (including a hostile `__proto__`) are refused; every field is checked.
export function validateConfig(patch, current = DEFAULT_CONFIG) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) throw invalidConfig('config must be an object');
  const keys = Object.keys(patch);
  if (keys.length === 0) throw invalidConfig('config needs at least one of: ' + CONFIG_FIELDS.join(', '));
  for (const k of keys) if (!CONFIG_FIELDS.includes(k)) throw invalidConfig(`unknown config field "${k.slice(0, 40)}"`);
  const next = { ...current };
  for (const k of keys) next[k] = patch[k];
  if (!isEmbeddingModel(next.embeddingModel)) throw invalidConfig(`embeddingModel must be one of ${EMBEDDING_MODEL_IDS.join(', ')}`);
  if (typeof next.vectorRedis !== 'string' || !STORE_IDS.includes(next.vectorRedis)) throw invalidConfig(`vectorRedis must be one of ${STORE_IDS.join(', ')}`);
  if (typeof next.strictness !== 'number' || !Number.isFinite(next.strictness) || next.strictness < 0 || next.strictness > 1) throw invalidConfig('strictness must be a number from 0 to 1');
  if (typeof next.ttlMs !== 'number' || !Number.isInteger(next.ttlMs) || next.ttlMs < BOUNDS.minTtlMs) throw invalidConfig('ttlMs must be a whole number of milliseconds greater than zero (zero and negative TTLs are refused)');
  if (next.ttlMs > BOUNDS.maxTtlMs) throw invalidConfig(`ttlMs must be at most ${BOUNDS.maxTtlMs}`);
  return next;
}

// One entry is live from storedAt until expiresAt, and expires AT expiresAt (a lookup at exactly that time misses).
export const isLive = (entry, now) => now < entry.expiresAt;

const publicEntry = (e) => ({ prompt: e.prompt, answer: e.answer, outputTokens: e.outputTokens, storedAt: e.storedAt, expiresAt: e.expiresAt });

// The vector-store stand-ins ("vector Redis"). Not Redis: an in-memory list that can be switched off to show an outage.
export function createVectorStores() {
  const stores = new Map(STORE_IDS.map((id) => [id, { id, available: true, entries: [] }]));
  const get = (id) => { const s = stores.get(id); if (!s) throw invalidConfig(`no such vector store: ${String(id).slice(0, 40)}`); return s; };
  return {
    get,
    setAvailable(id, available) { get(id).available = Boolean(available); },
    isAvailable: (id) => get(id).available,
    size: (id) => get(id).entries.length,
    sweep(id, now) { const s = get(id); const before = s.entries.length; s.entries = s.entries.filter((e) => isLive(e, now)); return before - s.entries.length; },
    add(id, entry) {
      const s = get(id);
      s.entries.push(entry);
      let evicted = 0;
      while (s.entries.length > BOUNDS.maxEntriesPerStore) { s.entries.shift(); evicted += 1; }
      return evicted;
    },
    clear() { for (const s of stores.values()) { s.entries = []; s.available = true; } },
  };
}

export function createKeyCache({ id, config = DEFAULT_CONFIG, clock, stores }) {
  if (!clock || typeof clock.now !== 'function') throw new TypeError('a lab clock is required');
  if (!stores) throw new TypeError('vector stores are required');
  const key = createLlmKey({ id, budgetTokens: 0 }); // the ledger is unused: this lab has no token budget; only the Usage counter matters
  let cfg = validateConfig(config, DEFAULT_CONFIG);
  let nextId = 1;

  const live = () => stores.get(cfg.vectorRedis);

  return {
    id,
    usage: key.usage,
    getConfig: () => ({ ...cfg }),
    setConfig(patch) { cfg = validateConfig(patch, cfg); return { ...cfg }; },

    // The nearest live entry of THIS key, made with THIS key's embedding model, in THIS key's vector store. Entries of another key, or
    // made with another embedding model, are never compared (their vectors are in a different space). Records Usage: a request, and
    // on a hit the saved tokens (the stored answer's output tokens). Throws a named error when the store stand-in is down.
    lookup(prompt) {
      validatePrompt(prompt);
      const store = live();
      if (!store.available) throw storeUnavailable(store.id);
      const now = clock.now();
      stores.sweep(store.id, now);
      const vec = embed(cfg.embeddingModel, prompt);
      if (!vec) throw invalidPrompt('prompt has no letters or digits to encode');
      let best = null;
      for (const e of store.entries) {
        if (e.keyId !== id || e.embeddingModel !== cfg.embeddingModel) continue;
        const score = cosine(vec, e.vector);
        if (best === null || score > best.score) best = { entry: e, score };
      }
      const hit = best !== null && best.score >= cfg.strictness;
      key.usage.record({ fromCache: hit, savedTokens: hit ? best.entry.outputTokens : 0 });
      return {
        hit, similarity: best ? best.score : null, threshold: cfg.strictness,
        matched: hit ? publicEntry(best.entry) : null,
        nearest: best ? publicEntry(best.entry) : null,
      };
    },

    // Keep an answer. The caller decides whether to call this: a prompt a guard blocked is never passed in (see path.js).
    store(prompt, answer, outputTokens) {
      validatePrompt(prompt);
      if (typeof answer !== 'string') throw new TypeError('answer must be a string');
      if (!Number.isFinite(outputTokens) || outputTokens < 0) throw new RangeError('outputTokens must be a non-negative number');
      const store = live();
      if (!store.available) throw storeUnavailable(store.id);
      const vector = embed(cfg.embeddingModel, prompt);
      if (!vector) throw invalidPrompt('prompt has no letters or digits to encode');
      const now = clock.now();
      const entry = { seq: nextId++, keyId: id, embeddingModel: cfg.embeddingModel, prompt, vector, answer, outputTokens, storedAt: now, expiresAt: now + cfg.ttlMs };
      const evicted = stores.add(store.id, entry);
      return { stored: true, storedAt: entry.storedAt, expiresAt: entry.expiresAt, evicted };
    },

    entryCount() {
      const store = live();
      return store.entries.filter((e) => e.keyId === id && e.embeddingModel === cfg.embeddingModel && isLive(e, clock.now())).length;
    },
  };
}
