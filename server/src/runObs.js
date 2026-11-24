// Rule 27: this lab's side of the shared run-observability panel. Pure functions around the vendored collector (runObservability.js, never
// edited here): the events one run (or one scenario's runs) leaves behind, the one stdout line each decision writes, and the record builder.
//
// Mock only: every row is `simulated` and is an event this lab's own mock computed on this run (nothing is invented; a layer the mock never
// touched says so). The lab reads no logs, so only the collector core is vendored (no readers file). Time = when the lab computed it: the
// run's wall-clock start plus the lab clock's offsets, so the rows and the stdout lines carry the same instants.
import { createRunObservability, LAYERS } from './runObservability.js';

export const SERVICE = 'privilege-semantic-cache-lab';
export const MAX_RUNS = 20;
const ID = /[^A-Za-z0-9._:/@-]/g;
const idText = (v) => String(v == null || v === '' ? '-' : v).replace(ID, '_').slice(0, 64);

// One timestamped line per decision: actor and outcome, never a prompt or an answer. Words a shared matcher reads as a decision are avoided
// on purpose (the result is passed / stopped / unclear, the step is a short id).
const RESULT = { allowed: 'passed', refused: 'stopped', blocked: 'stopped', info: 'unclear' };
export const decisionLine = (e, runId) => `${e.at} ${SERVICE} decision step=${idText(e.step)} actor=${idText(e.actor)} result=${RESULT[e.outcome] || 'unclear'} run=${idText(runId)}`;

const iso = (ms) => new Date(ms).toISOString();
const score = (n) => (typeof n === 'number' ? n.toFixed(3) : 'none');

// runs: [{ prompt, out }] where out is runPrompt's result (its `trace` hops carry the lab-clock time of each step).
// baseMs: wall-clock ms at the start of the run; originMs: the lab-clock time that maps to baseMs (the first hop of a live run, 0 for a scenario).
export function eventsFor(runs, { baseMs, originMs = 0 }) {
  const ev = [];
  for (const { prompt, out } of runs) {
    const cfg = out.config;
    const cacheActor = `${cfg.embeddingModel}/${cfg.vectorRedis}`;
    const at = (hop) => iso(baseMs + Math.max(0, hop.atMs - originMs));
    const push = (hop, e) => ev.push({ ...e, at: at(hop) });
    const first = out.trace[0];
    push(first, { layer: 'agent', step: 'request', actor: 'app', outcome: 'info', message: `The app sent a prompt of ${prompt.length} characters to the gateway with its LLM key (${out.key}). The prompt itself is in the trace, never in this log.`, detail: { key: out.key, chars: prompt.length } });
    for (const hop of out.trace) {
      if (hop.hop === 'guard') {
        push(hop, { layer: 'privilege', step: 'guard', actor: 'gateway', outcome: hop.result === 'blocked' ? 'blocked' : 'allowed', message: hop.result === 'blocked' ? 'The guard blocked the prompt before the cache: no lookup, no model call, nothing stored, no Usage (the lab\'s order, UNVERIFIED).' : 'The guard passed the prompt (the lab runs it before the lookup, UNVERIFIED).', detail: { result: hop.result } });
      } else if (hop.hop === 'lookup') {
        const message = hop.result === 'hit' ? `Cache lookup in ${cfg.vectorRedis}: nearest score ${score(hop.similarity)} is at or above the strictness ${hop.threshold}, so it is a hit.`
          : hop.result === 'miss' ? `Cache lookup in ${cfg.vectorRedis}: ${hop.similarity === null ? 'no live entry of this key and embedding model' : `nearest score ${score(hop.similarity)} is below the strictness ${hop.threshold}`}, so it is a miss.`
            : `Cache lookup in ${cfg.vectorRedis}: the vector store stand-in is unavailable (${hop.code}). No model call, no Usage.`;
        push(hop, { layer: 'privilege', step: 'cache-lookup', actor: cacheActor, outcome: 'info', message, detail: { result: hop.result, similarity: hop.similarity ?? null, strictness: hop.threshold ?? cfg.strictness } });
      } else if (hop.hop === 'provider') {
        push(hop, { layer: 'resource', step: 'provider-reply', actor: 'lab-provider/lab-model', outcome: 'info', message: `The mock provider replied HTTP ${hop.status} after ${hop.latencyMs} ms.`, detail: { status: hop.status, latencyMs: hop.latencyMs } });
      } else if (hop.hop === 'store') {
        push(hop, { layer: 'privilege', step: 'store', actor: cacheActor, outcome: 'info', message: `The answer was stored in ${cfg.vectorRedis} until lab time ${hop.expiresAt} ms (the key's TTL).${hop.evicted ? ` ${hop.evicted} oldest entr${hop.evicted === 1 ? 'y was' : 'ies were'} dropped at the cap.` : ''}`, detail: { expiresAt: hop.expiresAt, evicted: hop.evicted } });
      }
    }
    if (out.outcome === 'hit') {
      const last = out.trace.at(-1);
      push(last, { layer: 'privilege', step: 'answer-from-cache', actor: cacheActor, outcome: 'info', message: `Answered from the cache: ${out.matched.outputTokens} lab-model tokens counted as Saved (how the product computes Saved is UNVERIFIED).`, detail: { savedTokens: out.matched.outputTokens } });
    }
  }
  return ev.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

const WHY = {
  person: 'This lab has no signed-in person: the key belongs to an app.',
  authorize: 'This lab has no separate authorization decision: the guard and the cache lookup are shown under Privilege.',
  gateway: 'This lab has no agent gateway hop. The lab model of the LLM gateway is shown under Privilege.',
  agent: 'No call was made.', privilege: 'No call was made.', resource: 'No model provider was called in this run (a hit, a blocked prompt or an outage never reaches it).',
};
const PRODUCT = { agent: 'lab mock app', privilege: 'lab mock LLM gateway', resource: 'lab mock model provider' };

export function mockLayers(events) {
  return LAYERS.map((layer) => ({
    layer, products: [], reason: WHY[layer],
    simulated: events.filter((e) => e.layer === layer).map((e) => ({ at: e.at, product: PRODUCT[layer], outcome: e.outcome, message: e.message, detail: e.detail })),
  }));
}

// run: { id, startedAt (ISO), endedAt (ISO), events }.
export async function buildRunRecord(run, { clock = Date.now } = {}) {
  if (!run) return null;
  return createRunObservability({ clock }).collectRun({ runId: run.id, startedAt: run.startedAt, endedAt: run.endedAt, source: 'mock', layers: mockLayers(run.events) });
}

// The runs of a played scenario, in order: each run step with the prompt the scenario data gave it (steps line up with the scenario's steps).
export const scenarioRuns = (sc, played) => sc.steps.map((st, i) => ({ st, out: played.result.steps[i] })).filter((x) => x.st.do === 'run').map((x) => ({ prompt: x.st.prompt, out: x.out }));

// The span of a set of events, for the run's window.
export const spanMs = (events, baseMs) => events.reduce((m, e) => Math.max(m, Date.parse(e.at) - baseMs), 0);

// Where a run leaves logs and where they could stream (rule 27: the README says the same). The lab reads no log and claims no product logged anything.
export const STREAMS = Object.freeze([
  { product: 'This lab (stdout)', lives: 'one line per decision on the lab\'s standard output (docker logs)', streams: 'a collector could ship it to a log index; this lab does not' },
  { product: 'The Privilege gateway', lives: 'not read by this lab (no Real mode yet)', streams: 'the Privilege SIEM export; whether the product logs a cache hit or a miss is UNVERIFIED' },
]);
