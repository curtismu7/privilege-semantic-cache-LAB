# privilege-semantic-cache-LAB

Demo-tier standalone lab, step 1 (core) only: engine, API, tests. **No GitHub repo, no board claim, no shelf entry; port 7840 is PROVISIONAL.** Spec: `docs/spec.md`.

- `npm start` (127.0.0.1:7840), `npm test` (glob), `npm run doctor`, `npm run reset`. Node 26. Heavy work on the Air: `air-test . -- npm test` (git-add new files first).
- `server/src/`: `encoder.js` (stand-in, labelled not a real embedding model), `cache.js`, `path.js`, `scenarios.js` (9 scenarios as data, hand-written expected results), `app.js`, `checks.js` (one doctor check per scenario).
- All time is the kit's lab clock; no timers, `Date.now` or randomness in `server/src` (a test enforces it). `server/src/model-gateway-sim/` is vendored byte for byte from `AI-DEMO-Standalone/shared/model-gateway-sim/` and pinned: re-vendor, never edit.
- Everything beyond the 2026-11-21 release notes is UNVERIFIED and says so. **Never build** a cross-user (per-principal) leak scenario until the owner confirms how the cache is scoped; it stays an `openQuestions` card. Never claim fail-open or fail-closed for a Redis outage.
- Different embedding model ids must stay different encoders (n-gram size or seed). Every scenario needs a test and a doctor check. Hostile input is bounded in `bounds.js`.
- Loopback bind, Host check 421, same-origin JSON writes, netguard with a self-test. Only `.example` and `.invalid` hosts in shipped text.
- No AI attribution in commits or files. Never push or create a repo from here; the GitHub account is `curtismu7`.
