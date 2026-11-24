# privilege-semantic-cache-LAB

**Tier: Demo.** A standalone lab that shows per-key semantic caching in a Privilege-style LLM gateway: a similar prompt is answered from the key's cache, and the Usage view shows Requests, From cache and Saved.

**Status: step 2 of 3 (web UI, presenter mode, talk track, content pack, Docker).** Step 3 (shelf registry entry, proxy route, submodule pin, release) is the owner's integration step and is not done here.

## Simulated, and not
- **Simulated:** the gateway, the embedding model, the vector Redis, the LLM provider, the guard and time. All of it runs in this process with no network call. The encoder is a deterministic stand-in (hashed character n-grams, cosine similarity) and is **not a real embedding model**: a paraphrase scores high here only when it reuses words. The banner on every page, presenter mode included, says so.
- **Sourced** (2026-11-21 release notes only): each LLM key names its own embedding model and vector Redis, a match strictness and a TTL, and the Usage view shows Requests, From cache and Saved.
- **UNVERIFIED (this lab's own model):** how Saved is computed, whether the cache is scoped by key only or also by user, whether the guard runs before or after the lookup, and what a Redis outage does. The per-user scope is shown as an open-question card with no result, never a scenario.

## Mock and Real
Mock only. The header toggle shows Mock pressed and Real disabled with the server's reason. `GET /api/info` reports `source: mock`, `realAvailable: false` with a plain reason; `POST /api/mode {"source":"real"}` answers 409. Real (owner-run, read-only, needs a tenant running the 2026-11-21 release) comes after Mock. Nothing here has been verified against the real product.

## Run
```sh
npm ci
npm run build      # builds web/dist, which the server serves
npm start          # http://127.0.0.1:7847/  (loopback only; the API is under /api)
npm test           # server (node --test test/*.test.js), web (vitest), scripts (node --test scripts/*.test.mjs)
npm run doctor     # one check per scenario, kit pin, stories and diagram, netguard, an HTTP pass through the API
npm run reset      # resets a running lab: the default workspace, or node scripts/reset.mjs [base-url] [workspace]
./scripts/run.sh   # install if needed, build if needed, doctor, start
```
Docker (OrbStack): `HOST_PORT=7847 docker compose up --build -d`, published on `127.0.0.1` only, non-root, read-only, `restart: unless-stopped`, healthcheck on `/api/health`. For branding, copy `customer.config.example.json` to `customer.config.json` beside the compose file and uncomment the volume in `docker-compose.yml` (the container's root file system is read-only); host-run reads it from the repo root.
Node 26. Heavy work on the Air: `air-test . -- npm test` (git add new files first). The tests need no web build.

## Pages
- **Semantic cache**: the key form (embedding model, vector store, strictness slider 0 to 1, TTL; the server's 400 is shown as it words it), the similarity view (one pair against the strictness line: move the slider and the same score flips between HIT and MISS), a prompt box (with a "the guard blocks this prompt" box), the nine scenarios, the lab controls (advance the clock, switch a vector store off, set the mock model's state), then the verdict first (HIT with its score and the entry it matched, or MISS, BLOCKED or a named ERROR), Usage (Requests, From cache, Saved, the unit labelled UNVERIFIED), the trace of every hop (shared `GatewayTrace`) and what the run left behind (below). The open-question card on the cache scope sits under the result.
- **Diagram**: `semantic-cache`, loaded by name from diagram-studio data: movable boxes, Simulate, Prev/Next, speed, and Reset (also restores the box positions).
- **Stories and talk track**: nine stories as data with `{{cast}}` tokens and three vertical packs (retail, health, finance), filled for the vertical picked in the header; each opens its scenario. The talk track is `docs/talk-track.md`, one source for the page, the header dialog and presenter mode (`P`).
- **Limits (UNVERIFIED)**: exactly what the release notes say and what is the lab's own model; the stand-in encoder is named as such.

## API
`GET /api/health`, `/api/info`, `/api/scenarios`, `/api/key`, `/api/usage`, `/api/story`, `/api/diagram?name=`, `/api/run-observability`; `POST /api/scenario/:id`, `/api/run`, `/api/clock/advance`, `/api/similarity`, `/api/mode`, `/api/reset`; `PUT /api/key`, `/api/store`, `/api/provider`. Step 2 added `PUT /api/store` (outage toggle), `PUT /api/provider` (mock model state) and `POST /api/similarity` (read-only score of a pair). Every write is same-origin JSON and bounded.

## Port
**7847 is PROVISIONAL**: claimed provisionally, not registered on the board and not in the shelf registry yet. Set `PORT` (7800-7999) to move it.

## Workspaces and branding
Each browser tab sends `X-Workspace` (default `default`); the key, its cache, the lab clock, the last run and the run log are per workspace (at most 20; the least recently used is forgotten), and Reset clears one. When the cap forgets a tab's workspace (or the server restarts), the server marks the rebuilt workspace (`X-Workspace-Fresh: 1`) and the page says so in a banner and shows the defaults. `customer.config.json` (git-ignored; see `customer.config.example.json`) sets the lab's name, tagline, vertical and the five cast words; a bad field falls back to its default with a warning.

## Scenarios
`GET /api/scenarios`; run one with `POST /api/scenario/:id`: exact-repeat-hits, paraphrase-hits-with-score, unrelated-misses, strictness-flips-the-pair, ttl-expiry-misses, usage-matches-calls, two-keys-never-share, guard-blocked-not-cached, store-outage-named-error. Each carries a hand-written expected result, and the UI shows whether the run equals it. The cross-user case is deliberately not a scenario.

## Observability (rule 27)
Every run, live or a scenario, leaves two things. **On the lab's standard output (`docker logs`)** one line per decision: `<iso time> privilege-semantic-cache-lab decision step=<step> actor=<actor> result=passed|stopped|unclear run=<id>`, never a prompt or an answer. **In the page**, under the result, the shared "what this run left behind" panel lists the same decisions in time order across the six layers; every row is tagged **simulated** (the lab's mock computed it) and a layer with nothing says **not logged** (Person, Authorize and Agent gateway have nothing here). Agent is the calling app, Privilege is the lab's model of the LLM gateway (guard, lookup, store), Resource server is the mock model. The lab reads no log, so it claims nothing about what any product logged; whether and where the real gateway logs a cache hit or miss is UNVERIFIED. Where such logs could stream (a log collector to a SIEM) is named in the panel's "where these logs live" block. Time is when the lab computed it: the run's start plus the lab clock's offsets.

## Layout
`server/src/` (`encoder.js` stand-in encoder, `cache.js` per-key cache and vector store stand-ins, `path.js` the request path, `scenarios.js`, `session.js`, `app.js`, `checks.js` doctor, `runObs.js` and `runTrace.js` for the panels, `workspaces.js`, stories and customer config), `web/` (React + Vite), `docs/`. Vendored byte for byte and pinned by tests: `server/src/model-gateway-sim/`, `server/src/health.js`, `gatewayTrace.js`, `runObservability.js`, `web/src/{top-menu,floating-dialog,diagram-kit,gateway-trace,run-observability,talk-track}/`, `web/src/components/JsonPane.*` and `web/src/standalone-ui.css`. Never hand-edit; change the shared component first, then re-vendor and re-pin. The diagram data `server/diagrams/semantic-cache.json` is a byte copy of the diagram-studio data, pinned by `server/diagrams/diagrams.sha256`, which names the source commit.

MIT licensed.
