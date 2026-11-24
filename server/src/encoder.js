// A STAND-IN ENCODER, NOT A REAL EMBEDDING MODEL. It hashes character n-grams into a fixed-size vector, normalises it and compares
// with cosine similarity. It measures how much SURFACE TEXT two prompts share, not what they mean, so a paraphrase scores high only
// when it reuses words. It exists so the lab is deterministic and tests are stable. No model download, no network, no randomness.
//
// Each "embedding model" id in EMBEDDING_MODELS is a different encoder (a different n-gram size or a different hash seed), so two
// keys with different embedding models never agree by accident: their vectors live in different spaces. The ids are the lab's own.
export const ENCODER_LABEL = 'stand-in encoder (hashed character n-grams): not a real embedding model';
export const DIMS = 256;
export const EMBEDDING_MODELS = Object.freeze({
  'lab-embed-a': Object.freeze({ ngram: 3, seed: 0x9e3779b1 }),
  'lab-embed-b': Object.freeze({ ngram: 3, seed: 0x85ebca77 }), // same size, other seed: a different vector space
  'lab-embed-c': Object.freeze({ ngram: 2, seed: 0x27d4eb2f }),
  'lab-embed-d': Object.freeze({ ngram: 4, seed: 0x165667b1 }),
});
export const EMBEDDING_MODEL_IDS = Object.keys(EMBEDDING_MODELS);
export const isEmbeddingModel = (id) => typeof id === 'string' && Object.hasOwn(EMBEDDING_MODELS, id);

// Lower-case, NFKC, anything that is not a letter or digit becomes one space. Returns '' when nothing is left.
export function normalizeText(text) {
  return String(text).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// FNV-1a over code points, then a murmur3 finaliser so the low bits are well mixed.
function hash(codePoints, seed) {
  let h = seed >>> 0;
  for (const c of codePoints) { h ^= c; h = Math.imul(h, 16777619) >>> 0; }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

// text -> a unit-length vector of DIMS numbers, or null when the text has no letters or digits (nothing to encode).
export function embed(modelId, text) {
  if (!isEmbeddingModel(modelId)) throw new RangeError(`unknown embedding model: ${String(modelId).slice(0, 40)}`);
  const { ngram, seed } = EMBEDDING_MODELS[modelId];
  const norm = normalizeText(text);
  if (!norm) return null;
  const cps = Array.from(` ${norm} `, (ch) => ch.codePointAt(0));
  const v = new Float64Array(DIMS);
  const last = Math.max(cps.length - ngram, 0);
  for (let i = 0; i <= last; i++) {
    const h = hash(cps.slice(i, i + ngram), seed);
    v[h % DIMS] += ((h >>> 16) & 1) ? 1 : -1; // signed hashing keeps unrelated texts near zero
  }
  let n = 0;
  for (let i = 0; i < DIMS; i++) n += v[i] * v[i];
  n = Math.sqrt(n);
  if (n === 0) return null; // every n-gram cancelled: treat as nothing to encode
  for (let i = 0; i < DIMS; i++) v[i] /= n;
  return v;
}

// Cosine similarity of two vectors, rounded to 6 places so a score compares and prints the same everywhere.
export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) throw new TypeError('cosine needs two vectors of the same length');
  let dot = 0; let na = 0; let nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : Math.round((dot / d) * 1e6) / 1e6;
}

// THE score the cache works with: a cosine below zero counts as 0. Lookup and the read-only /api/similarity both use this one function, so the
// Similarity card never shows a score a run cannot produce, and strictness 0 means "everything hits" in both.
export const cacheScore = (a, b) => Math.max(0, cosine(a, b));

export const similarity = (modelId, textA, textB) => {
  const a = embed(modelId, textA); const b = embed(modelId, textB);
  return a && b ? cosine(a, b) : 0;
};
