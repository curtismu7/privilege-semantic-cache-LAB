# privilege-semantic-cache-LAB

Demo-tier standalone lab, step 2 (engine, API and web UI). The repo exists (`curtismu7/privilege-semantic-cache-LAB`); port **7847 is claimed PROVISIONALLY** (no board row, no shelf registry entry, no proxy route yet: step 3, owner-gated). Spec: `docs/spec.md`. Source of claims: the 2026-11-21 release notes only; everything else is UNVERIFIED (lab model) and the Mock or Real modal (`MODE_LINES` in `web/src/App.jsx`, from the same words as `server/src/banner.js`) says so. Never present anything here as a Ping statement.

- Run `npm start` (127.0.0.1:7847, serves `web/dist`), build `npm run build`, test `npm test` (server, web, scripts), preflight `npm run doctor`, reset `npm run reset`. Node 26. Heavy work on the Air: `air-test . -- npm test` (git-add new files first).
- Core `server/src/`: `encoder.js` (stand-in, labelled not a real embedding model), `cache.js`, `path.js`, `scenarios.js` (9 scenarios as data, hand-written expected results), `session.js` (clock, stores, provider, one key), `app.js` (API), `checks.js` (one doctor check per scenario, plus stories and diagram), `bounds.js`.
- All lab time is the kit's lab clock; the engine files never read the wall clock or a timer (a test enforces it). `server/src/model-gateway-sim/` is vendored byte for byte from `shared/model-gateway-sim/` and pinned: re-vendor, never edit.
- Everything beyond the release notes is UNVERIFIED and says so. **Never build** a cross-user (per-principal) leak scenario until the owner confirms how the cache is scoped; it stays an `openQuestions` card with no result. Never claim fail-open or fail-closed for a Redis outage.
- Web (`web/`, React + Vite, built to `web/dist`, served by the server; tests need no build): pages Semantic cache, Diagram, Stories and talk track, Limits. Everything vendored from `shared/` (top-menu, floating-dialog, diagram-kit, gateway-trace, run-observability, JsonPane, standalone-ui.css, talk-track dialog) is pinned by a test and never hand-edited: change the shared component first. Diagram data `server/diagrams/semantic-cache.json` is a byte copy from diagram-studio main (the pin names the commit).
- State is per workspace (`X-Workspace`, default `default`, at most 20, least recently used forgotten): session, run log, last run (`workspaces.js`). Stories are data (`server/src/data/stories`, `{{cast}}` tokens, four packs in `data/verticals`, default `airlines` = AirGuard Airlines, an invented airline; retired names are Meridian Air, Northwind, Fabrikam, Contoso), the talk track is `docs/talk-track.md`; a test fails on an undefined token. Content pack: `npm run content-pack` (a test fails on drift).
- Routes the web page added to the engine's own: `PUT /api/store` (outage toggle), `PUT /api/provider` (mock model state), `POST /api/similarity` (read-only score of a pair). Each is bounded, same-origin and tested (`server/test/controls.test.js`).
- Rule 27: `runObs.js` builds the run's events, one stdout line per decision and the record for the shared panel (all `simulated`); the lab reads no logs. Trace: `runTrace.js`.
- Docker: `docker-compose.yml` publishes `127.0.0.1:7847` only, non-root, read-only, `restart: unless-stopped`; pinned by `scripts/compose.test.mjs`. `customer.config.json` needs the optional bind mount in the compose file.
- Hostile input is bounded in `bounds.js`. Loopback bind, Host check 421, same-origin JSON writes, netguard with a self-test. Only `.example` and `.invalid` hosts in shipped text.
- Not built yet: Real mode, the shelf registry entry, proxy route, submodule pin and release (step 3, owner-gated), Story mode.
- No AI attribution in commits or files. The GitHub account is `curtismu7`.

## Never-repeat lessons
- A worktree basename must be unique (air-test names its remote folder after it).
- `new URL('./x', import.meta.url)` in a server file the web tests import must go through a variable (Vite rewrites the literal); a missing `/assets` file is a 404, never `index.html`.
- Dockerfile `COPY` sources must not be excluded by `.dockerignore` (a compose test checks it; only a real OrbStack build proves it).
- The first story/talk-track load sends no `vertical` (a default parameter would hide customer.config).
- Reset, a mode switch and a vertical change clear the scenario from the address hash; a page runs a hash scenario only on a deliberate navigation (mount or a changed hash), never on a remount.
- Presenter code reads the stored run's real field names (`{ kind, id, played, runId, trace }`), and a test runs it with a run present.
- The workspace-id pattern is the same on client and server, and the random fallback fills the array in place (`Uint8Array.map` returns a new array).
- Pressing the already-active Mock button changes nothing (no request, no reload).
- `npm run reset` takes a workspace id (`node scripts/reset.mjs [base-url] [workspace]`, or `PSC_WORKSPACE`).
- The netguard allows a literal IP in `dns.lookup` (an opted-in bind); connecting to it is still blocked.
- Shortcut keys ignore modifiers, repeats and focused controls.
- Static scans skip `.github/` and the shared attribution script.
- A box or button wrapper handles keys only when `e.target === e.currentTarget` (buttons inside an expanded box keep their own keys).
- What the talk track says to point at must be what the page shows after that action (a scenario shows its own Usage card; the live key's Usage stays untouched).
- A tab that has used its workspace id is told (`X-Workspace-Fresh`) when the server forgot it; after its own Reset the next call is fresh on purpose.
- A late answer from a run started before a Reset, vertical change or mode switch is dropped.
- A port is checked against running containers and compose files (`docker ps`; the ap-* labs use 7839 to 7843), not only the registry. This lab's ports are 7800-7999 and `resolvePort` enforces it.
