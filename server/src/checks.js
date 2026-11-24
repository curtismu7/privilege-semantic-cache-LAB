// The lab's doctor checks: synchronous, no network, no secret. Used by `npm run doctor` and (refreshed in the background) GET /api/health.
// Every scenario is one check: the same run the tests make, with its expected result.
import fs from 'node:fs';
import { BANNER, OPEN_QUESTIONS } from './banner.js';
import { validateConfig } from './cache.js';
import { nodeCheck } from './doctor.js';
import { checkPin, PIN_FILE } from './pin.js';
import { assertBindAllowed, bindHost, resolvePort } from './safety.js';
import { SCENARIOS, runScenario } from './scenarios.js';

const attempt = (id, fn) => {
  try { const r = fn(); return { id, level: r.ok ? 'pass' : 'fail', detail: r.detail }; } catch (e) { return { id, level: 'fail', detail: String(e.message).slice(0, 160) }; }
};
const refused = (fn) => { try { fn(); return false; } catch (e) { return e?.code === 'invalid_config'; } };

export function runChecks(env = process.env) {
  const checks = [nodeCheck(26)];
  checks.push(attempt('banner', () => ({ ok: /UNVERIFIED/.test(BANNER) && /2026-11-21/.test(BANNER) && /SIMULATED/.test(BANNER) && /NOT a real embedding model/.test(BANNER), detail: 'the banner says what is simulated, that the encoder is not a real embedding model, and that the rest is UNVERIFIED' })));
  checks.push(attempt('bind', () => { const h = assertBindAllowed(bindHost(env), env); resolvePort(env); return { ok: true, detail: `binds ${h} (loopback unless PSC_BIND is set on purpose)` }; }));
  checks.push(fs.existsSync(PIN_FILE)
    ? attempt('kit-pin', () => { const p = checkPin(); return { ok: p.length === 0, detail: p.length ? p.join('; ') : 'the vendored model-gateway-sim files match the pin' }; })
    : { id: 'kit-pin', level: 'info', detail: 'pin file not shipped in this build; the repo tests check it' });
  checks.push(attempt('config-validation', () => ({
    ok: refused(() => validateConfig({ strictness: 1.5 }))
      && refused(() => validateConfig({ strictness: -0.1 }))
      && refused(() => validateConfig({ ttlMs: 0 }))
      && refused(() => validateConfig({ ttlMs: -5 }))
      && refused(() => validateConfig(JSON.parse('{"__proto__":{"x":1}}'))),
    detail: 'strictness outside 0 to 1, a zero or negative TTL and a prototype key are refused',
  })));
  checks.push(attempt('open-questions', () => ({
    ok: OPEN_QUESTIONS.some((q) => q.id === 'cache-scope-per-user' && q.result === null && q.status === 'open') && !SCENARIOS.some((s) => /user|principal|leak/i.test(s.id)),
    detail: 'the per-user cache scope is an open-question card with no result, and no scenario answers it',
  })));
  for (const sc of SCENARIOS) {
    checks.push(attempt(`scenario:${sc.id}`, () => {
      const r = runScenario(sc.id);
      const failed = r.checks.filter((c) => !c.pass);
      return { ok: r.ok, detail: r.ok ? `${r.checks.length} expected results hold` : `failed: ${failed.map((c) => c.path).join(', ')}` };
    }));
  }
  return checks;
}
