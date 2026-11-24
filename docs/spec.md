# privilege-semantic-cache-LAB spec

**Status:** step 1 (core) built, Mock only   **Owner:** Curtis Muir (decides)   **Source:** the 2026-11-21 vendor release notes (the only source); expands "Lab 2" of the model-gateway labs spec. Everything the notes do not say is **UNVERIFIED (lab model)** and the lab shows that label.

## Goal
Show per-key semantic caching: a similar prompt is answered from the key's cache, and the Usage view shows Requests, From cache and Saved. The notes say each LLM key names its own embedding model and vector Redis, a match strictness and a TTL; that is all that is sourced.

## What is simulated
Everything. The encoder is a deterministic stand-in (hashed character n-grams, normalised, cosine), **not a real embedding model**: it measures shared text, not meaning. The model is the kit's provider stub; the vector Redis is an in-memory stand-in that can be switched off; time is the kit's lab clock. No network.

## Acceptance (one test and one `npm run doctor` check each)
1. Exact repeat: miss, then hit with score 1 and no model call.
2. A paraphrase above the strictness hits and shows its score.
3. An unrelated prompt misses.
4. The same pair flips between hit and miss when the strictness moves (score unchanged).
5. A repeat after the TTL misses: stored at lab time t, live until t + ttl, gone AT t + ttl.
6. Usage matches the calls: Requests per lookup, From cache per hit, Saved = the stored answer's output tokens per hit.
7. Two keys with different embedding models or different vector stores never share an answer.
8. A guard-blocked prompt is never looked up, sent, stored or counted; the same text later is a miss.
9. Vector store down: the named error `vector_store_unavailable` (503), no model call, no Usage.
Also: encoder determinism; a paraphrase scores above an unrelated prompt on a 16-triple table for every model id; a score equal to the strictness is a hit.

## API (all under `/api/`)
`GET /health` (demo-health/1), `GET /info` (mode mock, realAvailable false with a plain reason, banner, UNVERIFIED list, `openQuestions`), `POST /mode` (refuses real and live), `GET /scenarios`, `POST /scenario/:id`, `GET|PUT /key` (embeddingModel, vectorRedis, strictness 0..1, ttlMs), `POST /run {prompt, guardBlocked?}`, `POST /clock/advance {ms}`, `GET /usage`, `POST /reset`.

## Unhappy paths (each has a test)
Empty, blank, non-string, no-letters and over-20000-character prompts (`invalid_prompt`); strictness outside 0..1, TTL zero, negative, fractional or over a week, unknown model or store, unknown fields, prototype keys (`invalid_config`); body over 128 KB (413), non-JSON (415), bad JSON (400); store capped at 100 entries (oldest evicted); provider failure is a named result and stores nothing; foreign Host 421; cross-origin write 403; loopback bind only; netguard self-test, zero outbound attempts.

## UNVERIFIED (lab model, listed on the page)
How Saved is computed (the lab counts output tokens); the cache scope (the lab scopes per key, embedding model and store); guard order (the lab runs the guard first); Redis outage behaviour (the lab shows a named error and claims neither fail-open nor fail-closed); the similarity scale, TTL semantics (a hit does not extend a TTL), the entry cap.

## Open question (card, no result)
Is the cache scoped by key only, or also by user? **No cross-user leak scenario is built** until the owner confirms the scoping. `GET /api/info` carries the question in `openQuestions`.

## Out of scope
Real embeddings or Redis; Real mode (owner-run, read-only, built after Mock; the toggle stays disabled with a plain reason); the web UI, diagram, story mode, Docker and shelf entry (later steps); ports and repos (the port 7840 is PROVISIONAL, not claimed).

## Verification
`npm test` on Node 26 (Air); `npm run doctor`; vendored kit pin test; history scan 0 and gitleaks clean; mutation checks on the six core rules.
