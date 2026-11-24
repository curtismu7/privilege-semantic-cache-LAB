// The simulation banner: what is simulated, and what is and is not sourced. Shown on every page later (rule 2) and returned by /api/info.
export const BANNER = 'SIMULATED. Semantic caching runs in this app on a lab clock: no gateway, no embedding model, no Redis, no LLM provider and no network call. '
  + 'The encoder is a stand-in (hashed character n-grams): it is NOT a real embedding model and measures shared text, not meaning. '
  + 'Only what the 2026-11-21 release notes say is sourced: each LLM key names its own embedding model and vector Redis, sets a match strictness and a TTL, and the Usage view shows Requests, From cache and Saved. '
  + 'Everything else is UNVERIFIED: this lab\'s own model.';

// Listed on purpose so nobody reads them as product behaviour.
export const UNVERIFIED = Object.freeze([
  'How Saved is computed: the lab counts the stored answer\'s output tokens (the product may count tokens, cost or something else).',
  'Cache scope: the lab scopes entries per key (and embedding model and store). Whether the product scopes by key only or also by user is not confirmed.',
  'Guard order: the lab runs the guard before the cache lookup. Whether the product runs it before or after is not confirmed.',
  'Redis outage behaviour: the lab shows a named error and makes no model call. Whether the product serves from the model or refuses is not confirmed; the lab claims neither.',
  'The similarity scale, the strictness values, the TTL semantics (a hit does not extend a TTL in the lab) and the entry cap are the lab\'s own.',
]);

// An open question, not a result. Deliberately no scenario and no outcome behind it (owner, 2026-11-24: not built until the scoping is confirmed).
export const OPEN_QUESTIONS = Object.freeze([
  Object.freeze({
    id: 'cache-scope-per-user',
    title: 'Is the cache scoped by key only, or also by user?',
    question: 'If two different users (principals) call the same LLM key, can the second be served an answer that was cached for the first? The 2026-11-21 release notes do not say.',
    status: 'open',
    result: null,
    note: 'No scenario and no result is shown for this: it needs the owner to confirm how the product scopes the cache.',
  }),
]);

export const RELEASE_NOTES_DATE = '2026-11-21';

// The Limits page: exactly what the release notes say (the only sourced claims), and this lab's own model. The one place these are written.
export const SOURCED = Object.freeze([
  `Each LLM key can reuse earlier answers for semantically similar prompts (${RELEASE_NOTES_DATE} release notes).`,
  'Each key names its own embedding model and its own vector Redis.',
  'Each key sets a match strictness and a TTL.',
  'The Usage view shows Requests, From cache and Saved.',
]);

export const LAB_MODEL = Object.freeze([
  'The encoder is a stand-in: it hashes character n-grams into a 256-number vector and compares two vectors with cosine similarity. It is NOT a real embedding model: it measures shared text, not meaning, so a paraphrase scores high only when it reuses words. The four lab embedding ids are four different encoders (a different n-gram size or seed), so their vectors never agree by accident.',
  'A key keeps one list of earlier prompts and answers per vector store stand-in. A lookup compares the new prompt only with entries made by the same key with the same embedding model in the same store. A score equal to the strictness is a hit.',
  'The nearest live entry decides. A hit returns its stored answer, makes no model call and does not extend its TTL. A miss calls the lab\'s mock provider and stores the answer, live from the end of the call until stored time plus TTL (gone AT that time).',
  'Saved is the stored answer\'s output tokens, counted in lab-model tokens, for every hit. Requests counts every lookup that reached the cache.',
  'The guard decision comes from the caller (the "guard blocks this prompt" box). A blocked prompt is never looked up, sent, stored or counted.',
  'The vector store stand-in is an in-memory list capped at 100 entries (the oldest goes first). It can be switched off to show an outage: the run then ends in the named error vector_store_unavailable (HTTP 503 in the API), with no model call and no Usage.',
  'All time is the lab clock. The Advance control moves it; nothing waits or sleeps.',
]);
