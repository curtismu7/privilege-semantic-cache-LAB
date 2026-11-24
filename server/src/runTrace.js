// The "What Privilege did" trace for one run or one scenario (rule 25), built from runPrompt's results with the vendored gatewayTrace.js (mockTrace).
// Per run: one step for the app's call to the lab's mock gateway (its decisions: the guard, the cache lookup) and, on a miss, one step for the
// gateway's call to the mock provider. The lab's gateway computed every decision, so every basis is `checked`. Hosts are .example. The values
// shown as credentials are labelled lab mocks: the lab holds no credential for a key or a provider.
import { mockTrace } from './gatewayTrace.js';

const GATEWAY_URL = 'https://gateway.lab.example/v1/chat';
const PROVIDER_URL = 'https://provider.lab.example/v1/chat';
const MOCK = 'a lab mock value, not a credential';
const score = (n) => (typeof n === 'number' ? n.toFixed(3) : 'none');

const headline = (out) => ({
  hit: `HIT, score ${score(out.similarity)}, answered from the cache`,
  miss: out.similarity === null ? 'MISS, nothing close in the cache, answered by the model' : `MISS, nearest score ${score(out.similarity)}, answered by the model`,
  blocked: 'blocked by the guard, never looked up',
  error: `named error ${out.error?.code}`,
}[out.outcome]);

function decisionsFor(out) {
  const d = [];
  const guard = out.trace.find((h) => h.hop === 'guard');
  d.push(guard.result === 'blocked'
    ? { id: 'guard', label: 'Guard', outcome: 'fail', evidence: 'The caller\'s guard blocked this prompt before the cache. Nothing was looked up, sent or stored (the lab\'s order, UNVERIFIED).' }
    : { id: 'guard', label: 'Guard', outcome: 'pass', evidence: 'The guard passed the prompt (the lab runs it before the lookup, UNVERIFIED).' });
  const look = out.trace.find((h) => h.hop === 'lookup');
  if (!look) return d;
  const strictness = out.config.strictness;
  if (look.result === 'hit') d.push({ id: 'lookup', label: `Cache lookup in ${out.config.vectorRedis}`, outcome: 'pass', evidence: `Nearest live entry scores ${score(look.similarity)}, at or above the strictness ${strictness}: a hit. The model is not called.` });
  else if (look.result === 'miss') d.push({ id: 'lookup', label: `Cache lookup in ${out.config.vectorRedis}`, outcome: 'info', evidence: look.similarity === null ? 'No live entry of this key and embedding model: a miss.' : `Nearest live entry scores ${score(look.similarity)}, below the strictness ${strictness}: a miss.` });
  else d.push({ id: 'lookup', label: `Cache lookup in ${out.config.vectorRedis}`, outcome: 'fail', evidence: `The vector store stand-in is unavailable (${look.code}). No model call and no Usage. What the product does is UNVERIFIED.` });
  const prov = out.trace.find((h) => h.hop === 'provider');
  if (prov) d.push({ id: 'provider', label: 'Model call', outcome: prov.result === 'ok' ? 'pass' : 'fail', evidence: `The mock provider replied HTTP ${prov.status} after ${prov.latencyMs} ms.` });
  else d.push({ id: 'provider', label: 'Model call', outcome: 'skipped', evidence: out.outcome === 'hit' ? 'Not called: the cache answered.' : 'Not called.' });
  const stored = out.trace.find((h) => h.hop === 'store');
  if (stored) d.push({ id: 'store', label: 'Store', outcome: 'info', evidence: `The answer was stored until lab time ${stored.expiresAt} ms (the key's TTL).` });
  return d;
}

// runs: [{ prompt, out }]. Returns the exchanges in order, numbered from 1.
export function exchangesFor(runs) {
  const many = runs.length > 1;
  const list = [];
  runs.forEach(({ prompt, out }, i) => {
    const tag = many ? `Run ${i + 1}: ` : '';
    const appStatus = out.outcome === 'error' ? out.error.status ?? 500 : 200; // a blocked prompt is a normal result in the lab; the product's status is UNVERIFIED
    const body = out.outcome === 'error' || out.outcome === 'blocked'
      ? { ok: false, error: out.error, note: 'Lab model: the product\'s wording and status for this are UNVERIFIED.' }
      : { ok: true, servedBy: out.servedBy, similarity: out.similarity, answer: out.answer, note: 'Lab model: how the real response marks a cached answer is UNVERIFIED.' };
    list.push({
      title: `${tag}App to gateway: ${headline(out)}`, status: appStatus,
      trace: mockTrace({ url: GATEWAY_URL, authorization: `Bearer MOCK-key (${MOCK})`, requestHeaders: { accept: null }, rpc: { key: out.key, messages: [{ role: 'user', content: prompt }] }, status: appStatus, body, decisions: decisionsFor(out) }),
    });
    const prov = out.trace.find((h) => h.hop === 'provider');
    if (prov) {
      list.push({
        title: `${tag}Gateway to provider: ${prov.result === 'ok' ? 'answered' : 'could not answer'}`, status: prov.status,
        trace: mockTrace({
          url: PROVIDER_URL, authorization: `Bearer MOCK-provider-credential (${MOCK})`, requestHeaders: { accept: null },
          rpc: { model: 'lab-model', messages: [{ role: 'user', content: prompt }] }, status: prov.status,
          body: prov.result === 'ok' ? { model: 'lab-model', text: out.answer, usage: { note: 'lab mock' } } : { error: out.error?.message },
          decisions: [{ id: 'reply', label: prov.result === 'ok' ? 'The provider answered' : 'The provider could not answer', outcome: prov.result === 'ok' ? 'pass' : 'fail', evidence: `HTTP ${prov.status} after ${prov.latencyMs} ms (lab mock provider).` }],
        }),
      });
    }
  });
  return list.map((e, i) => ({ step: i + 1, ...e }));
}
