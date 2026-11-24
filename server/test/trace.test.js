import test from 'node:test';
import assert from 'node:assert/strict';
import { assertTrace } from '../src/gatewayTrace.js';
import { exchangesFor } from '../src/runTrace.js';
import { scenarioRuns } from '../src/runObs.js';
import { SCENARIOS, runScenario } from '../src/scenarios.js';
import { startLab } from './helpers.js';

const exchangesOf = (s) => exchangesFor(scenarioRuns(s, runScenario(s.id)));
const by = Object.fromEntries(SCENARIOS.map((s) => [s.id, exchangesOf(s)]));

test('every scenario produces traces that pass assertTrace, all mock, every decision checked', () => {
  for (const s of SCENARIOS) {
    const ex = by[s.id];
    assert.ok(ex.length >= 2, s.id);
    ex.forEach((e, i) => { assert.equal(e.step, i + 1); assert.deepEqual(assertTrace(e.trace), [], `${s.id} step ${e.step}`); assert.equal(e.trace.source, 'mock'); });
    for (const e of ex) for (const d of e.trace.decisions) assert.equal(d.basis, 'checked', `${s.id}: ${d.id}`);
  }
});

test('a miss has a provider step, a hit has none; the app step names the verdict first', () => {
  const exact = by['exact-repeat-hits'];
  assert.equal(exact.length, 3, 'miss (app + provider) then hit (app only)');
  assert.match(exact[0].title, /Run 1: App to gateway: MISS/);
  assert.match(exact[1].title, /Gateway to provider/);
  assert.match(exact[2].title, /Run 2: App to gateway: HIT, score 1\.000/);
  const hit = exact[2].trace.decisions;
  assert.equal(hit.find((d) => d.id === 'provider').outcome, 'skipped');
  assert.equal(hit.find((d) => d.id === 'lookup').outcome, 'pass');
  const flip = by['strictness-flips-the-pair'];
  assert.ok(flip.some((e) => /MISS, nearest score 0\.5/.test(e.title)), 'the same score, now below the raised strictness');
});

test('a blocked prompt and an outage are failures with their own words and never reach the provider', () => {
  const blocked = by['guard-blocked-not-cached'][0];
  assert.match(blocked.title, /blocked by the guard/);
  assert.equal(blocked.trace.decisions.length, 1);
  assert.equal(blocked.trace.decisions[0].outcome, 'fail');
  const outage = by['store-outage-named-error'].find((e) => /named error vector_store_unavailable/.test(e.title));
  assert.ok(outage); assert.equal(outage.status, 503);
  assert.ok(outage.trace.decisions.some((d) => d.id === 'lookup' && d.outcome === 'fail' && /UNVERIFIED/.test(d.evidence)));
});

test('nothing secret and nothing real in a trace: .example hosts, labelled mock credentials, no token-shaped value', () => {
  for (const s of SCENARIOS) {
    const text = JSON.stringify(by[s.id]);
    for (const m of text.matchAll(/https?:\/\/([^/"\\]+)/g)) assert.match(m[1], /\.example$/, m[1]);
    assert.match(text, /a lab mock value, not a credential/);
    assert.doesNotMatch(text, /eyJ[\w-]{8,}\.|sk-[A-Za-z0-9]{8,}/);
  }
});

test('the API returns the trace with the run and the scenario', async () => {
  const lab = await startLab();
  try {
    const run = (await lab.send('POST', '/api/run', { prompt: 'hello there friend' })).json;
    assert.equal(run.trace.exchanges.length, 2);
    assert.equal(run.trace.exchanges[0].trace.request.body.messages[0].content, 'hello there friend');
    const again = (await lab.send('POST', '/api/run', { prompt: 'hello there friend' })).json;
    assert.equal(again.trace.exchanges.length, 1);
    assert.match(again.trace.exchanges[0].title, /HIT/);
    const sc = (await lab.send('POST', '/api/scenario/store-outage-named-error', {})).json;
    assert.ok(sc.trace.exchanges.length >= 4);
    assert.equal(sc.ok, true);
  } finally { await lab.close(); }
});
