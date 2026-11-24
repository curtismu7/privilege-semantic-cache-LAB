# privilege-semantic-cache-LAB

**Tier: Demo.** A standalone lab that shows per-key semantic caching in a Privilege-style LLM gateway: a similar prompt is answered from the key's cache, and the Usage view shows Requests, From cache and Saved. **Step 1 (core: engine, API, tests) only; there is no web UI yet.**

## Simulated, and not
- **Simulated:** the gateway, the embedding model, the vector Redis, the LLM provider, the guard and time. All of it runs in this process with no network call. The encoder is a deterministic stand-in (hashed character n-grams, cosine similarity) and is **not a real embedding model**: a paraphrase scores high here only when it reuses words.
- **Sourced** (2026-11-21 release notes only): each LLM key names its own embedding model and vector Redis, a match strictness and a TTL, and the Usage view shows Requests, From cache and Saved.
- **UNVERIFIED (this lab's own model):** how Saved is computed, whether the cache is scoped by key only or also by user, whether the guard runs before or after the lookup, and what a Redis outage does. The per-user scope is shown as an open question, not a result.

## Status
Mock only. Real mode is not built: it is owner-run and read-only, needs a tenant running the 2026-11-21 release, and its toggle will stay disabled with a plain reason until then. Nothing here has been verified against the real product.

## Run
Node 26. `npm ci`, then `npm start` (127.0.0.1, port **7840, PROVISIONAL: not claimed yet**; `PORT` overrides). `npm test` (glob `node --test test/*.test.js`), `npm run doctor` (preflight, one check per scenario, netguard self-test, a pass through the HTTP API), `npm run reset` (clears a running lab). API: `GET /api/health`, `/api/info`, `/api/scenarios`, `POST /api/scenario/:id`, `GET|PUT /api/key`, `POST /api/run`, `GET /api/usage`, `POST /api/reset`. Spec: `docs/spec.md`.

## Layout
`server/src/encoder.js` (stand-in encoder), `cache.js` (per-key cache and vector store stand-ins), `path.js` (prompt, guard, lookup, provider, store), `scenarios.js` (nine scenarios as data), `app.js` (API), `checks.js` (doctor), `model-gateway-sim/` (the shared kit, vendored byte for byte and pinned), `netguard.js`, `safety.js`.

MIT licensed.
