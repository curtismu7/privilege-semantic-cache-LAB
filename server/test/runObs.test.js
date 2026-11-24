import test from 'node:test';
import assert from 'node:assert/strict';
import { assertRunObservability, LAYERS, classify, defaultLayers } from '../src/runObservability.js';
import { buildRunRecord, decisionLine, eventsFor, mockLayers, scenarioRuns, spanMs } from '../src/runObs.js';
import { SCENARIOS, runScenario } from '../src/scenarios.js';
import { startLab } from './helpers.js';

const BASE = Date.parse('2026-11-24T10:00:00.000Z');
const FORBIDDEN_WORDS = /refused|denied|rejected|forbidden|failed|invalid|expired|mismatch|token|audience|scope|served/i;

const recordFor = async (id) => {
  const sc = SCENARIOS.find((x) => x.id === id);
  const events = eventsFor(scenarioRuns(sc, runScenario(id)), { baseMs: BASE, originMs: 0 });
  const run = { id: 'run-1', startedAt: new Date(BASE).toISOString(), endedAt: new Date(BASE + spanMs(events, BASE)).toISOString(), events };
  return { record: await buildRunRecord(run, { clock: () => BASE }), events };
};

test('every scenario leaves a record that passes the shared assertRunObservability, all rows simulated, all six layers named', async () => {
  for (const s of SCENARIOS) {
    const { record } = await recordFor(s.id);
    assert.deepEqual(assertRunObservability(record), [], s.id);
    assert.equal(record.source, 'mock');
    assert.ok(record.rows.length >= 3, s.id);
    assert.deepEqual(Object.keys(record.coverage).sort(), [...LAYERS].sort(), s.id);
    for (const r of record.rows) assert.ok(r.origin === 'simulated' || r.origin === 'not-logged', `${s.id}: ${r.origin}`);
    for (const l of ['person', 'authorize', 'gateway']) assert.equal(record.coverage[l], 'not-logged', `${s.id}: ${l} has nothing and says so`);
    assert.ok(record.reasons.person && record.reasons.gateway, 'a layer with nothing says why');
  }
});

test('the rows say what happened: only the guard allows or blocks; hits, misses and replies are information, never invented', async () => {
  const exact = await recordFor('exact-repeat-hits');
  assert.equal(exact.record.summary.allowed, 2, 'the guard passed both prompts');
  assert.equal(exact.record.summary.blocked, 0);
  assert.equal(exact.record.rows.filter((r) => r.layer === 'resource').length, 1, 'one model call (the miss), none for the hit');
  assert.ok(exact.record.rows.some((r) => /Answered from the cache/.test(r.message)));
  const blocked = await recordFor('guard-blocked-not-cached');
  assert.equal(blocked.record.summary.blocked, 1);
  const outage = await recordFor('store-outage-named-error');
  assert.ok(outage.record.rows.some((r) => /unavailable \(vector_store_unavailable\)/.test(r.message)));
  const hitsOnly = await recordFor('two-keys-never-share');
  assert.ok(hitsOnly.record.rows.filter((r) => r.layer === 'resource').length === 3);
});

test('a run that never reaches the model leaves the resource layer empty and says why', async () => {
  const { events } = await recordFor('exact-repeat-hits');
  const hitOnly = events.filter((e) => e.layer !== 'resource');
  const layers = mockLayers(hitOnly);
  assert.equal(layers.find((l) => l.layer === 'resource').simulated.length, 0);
  assert.match(layers.find((l) => l.layer === 'resource').reason, /No model provider was called/);
});

test('row times are the stdout line times: one stamp per event, in time order, offsets from the lab clock', async () => {
  const { record, events } = await recordFor('ttl-expiry-misses');
  const times = record.rows.filter((r) => r.at).map((r) => r.at);
  assert.deepEqual(times, [...times].sort(), 'rows are in time order');
  assert.ok(events.every((e) => record.rows.some((r) => r.at === e.at)));
  const last = Math.max(...events.map((e) => Date.parse(e.at)));
  assert.equal(last - BASE, runScenario('ttl-expiry-misses').result.steps.at(-1).clockMs, 'the last event is at the end of the lab-clock run');
});

test('the stdout line: one per decision, a hostile name cannot forge a second field or a second line', () => {
  const e = { at: '2026-11-24T10:00:00.000Z', step: 'cache-lookup', actor: 'lab-embed-a/vector-redis-a', outcome: 'info' };
  assert.equal(decisionLine(e, 'run-3'), '2026-11-24T10:00:00.000Z privilege-semantic-cache-lab decision step=cache-lookup actor=lab-embed-a/vector-redis-a result=unclear run=run-3');
  const hostile = decisionLine({ ...e, actor: 'x result=passed\nrun=evil\r\n2026 forged line', step: 'a b' }, 'run 1\n');
  assert.ok(!/[\r\n]/.test(hostile));
  assert.equal(hostile.split(' ').filter((w) => w.startsWith('result=')).length, 1);
  assert.equal((hostile.match(/ run=/g) || []).length, 1);
});

test('no stdout line uses a word a shared matcher reads as a decision, and none is classified as a product line; no line holds a prompt', async () => {
  const lines = [];
  for (const s of SCENARIOS) for (const e of (await recordFor(s.id)).events) lines.push(decisionLine(e, 'run-1').replace(/^\S+ privilege-semantic-cache-lab /, ''));
  assert.ok(lines.length > 20);
  for (const l of lines) assert.doesNotMatch(l, FORBIDDEN_WORDS, l);
  for (const l of lines) assert.equal(classify(`2026-11-24T10:00:00.000Z privilege-semantic-cache-lab ${l}`), null, l);
  assert.equal(lines.some((l) => /photosynthesis|password|invoice/i.test(l)), false);
});

test('the lab reads no logs: only the collector core is vendored, and the layers carry only simulated rows', () => {
  const sc = SCENARIOS[0];
  const layers = mockLayers(eventsFor(scenarioRuns(sc, runScenario(sc.id)), { baseMs: BASE }));
  assert.deepEqual(layers.map((l) => l.layer), [...LAYERS]);
  assert.ok(layers.every((l) => l.products.length === 0 && !l.responses), 'no product reader and no API response row');
  assert.ok(defaultLayers().length > 0);
});

test('API: /api/run-observability is null before any run; a live run and a scenario run each leave their record; the stdout lines match the rows', async () => {
  const lines = [];
  const lab = await startLab({ log: (l) => lines.push(l), now: () => BASE });
  try {
    const empty = (await lab.get('/api/run-observability')).json;
    assert.equal(empty.record, null); assert.ok(empty.streams.length >= 2);
    const run = (await lab.send('POST', '/api/run', { prompt: 'summarise the open cases' })).json;
    assert.match(run.runId, /^run-\d+$/);
    const live = (await lab.get('/api/run-observability')).json;
    assert.equal(live.run.kind, 'live'); assert.equal(live.record.runId, run.runId);
    assert.deepEqual(assertRunObservability(live.record), []);
    assert.equal(lines.length, live.record.rows.filter((r) => r.origin === 'simulated').length, 'one stdout line per simulated row');
    for (const r of live.record.rows.filter((x) => x.origin === 'simulated')) assert.ok(lines.some((l) => l.startsWith(r.at)), r.message);
    const sc = (await lab.send('POST', '/api/scenario/exact-repeat-hits', {})).json;
    const after = (await lab.get('/api/run-observability')).json;
    assert.equal(after.run.kind, 'scenario'); assert.equal(after.run.scenarioId, 'exact-repeat-hits'); assert.equal(after.record.runId, sc.runId);
    assert.equal((await lab.get('/api/usage')).json.requests, 1, 'the scenario did not touch the live key: only the live run counted');
    assert.equal((await lab.send('POST', '/api/run-observability', {})).status, 404);
  } finally { await lab.close(); }
});

test('a refused prompt leaves no run behind (nothing was decided)', async () => {
  const lab = await startLab();
  try {
    assert.equal((await lab.send('POST', '/api/run', { prompt: '' })).status, 400);
    assert.equal((await lab.get('/api/run-observability')).json.record, null);
    assert.equal((await lab.get('/api/info')).json.runsSinceReset, 0);
  } finally { await lab.close(); }
});

test('a run at the lab clock\'s far end still leaves a record (a week of lab time)', async () => {
  const lab = await startLab({ now: () => BASE });
  try {
    await lab.send('POST', '/api/clock/advance', { ms: 7 * 24 * 3_600_000 });
    await lab.send('POST', '/api/run', { prompt: 'a prompt a week into the clock' });
    const rec = (await lab.get('/api/run-observability')).json.record;
    assert.deepEqual(assertRunObservability(rec), []);
    assert.equal(Date.parse(rec.rows.find((r) => r.at).at), BASE, 'times are offsets from the start of the run, not from lab time zero');
  } finally { await lab.close(); }
});
