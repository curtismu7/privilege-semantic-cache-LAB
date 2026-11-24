// Every hostile-input bound in one place. The spec lists them; tests pin them.
export const BOUNDS = Object.freeze({
  maxPromptChars: 20000,          // the same limit as the kit's provider stub
  minTtlMs: 1,
  maxTtlMs: 7 * 24 * 3_600_000,   // one week of lab time
  maxEntriesPerStore: 100,        // oldest entry is evicted past this
  maxAdvanceMs: 7 * 24 * 3_600_000,
  maxStores: 3,
  maxRunsKept: 20,
  maxBodyBytes: 128 * 1024,       // 20000 characters, all escaped (6 bytes each as \u00XX), still fit
  maxSimilarityBodyBytes: 2 * 20000 * 6 + 1024, // POST /api/similarity takes TWO prompts
});
