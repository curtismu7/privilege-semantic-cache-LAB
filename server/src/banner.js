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
