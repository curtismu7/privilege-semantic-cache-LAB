import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, describeScenarios, evaluate, findScenario, getPath, runScenario } from '../src/scenarios.js';

const EXPECTED_IDS = [
  'exact-repeat-hits', 'paraphrase-hits-with-score', 'unrelated-misses', 'strictness-flips-the-pair', 'ttl-expiry-misses',
  'usage-matches-calls', 'two-keys-never-share', 'guard-blocked-not-cached', 'store-outage-named-error',
];

test('the scenarios are the nine the spec names, as data with hand-written expected results; no per-user leak scenario exists', () => {
  assert.deepEqual(SCENARIOS.map((s) => s.id), EXPECTED_IDS);
  for (const s of SCENARIOS) {
    assert.ok(s.title && s.story, s.id);
    assert.ok(s.expect.length >= 5, `${s.id} has expected results`);
    assert.deepEqual(JSON.parse(JSON.stringify(s)), s, `${s.id} survives a JSON round trip (plain data)`);
  }
  assert.equal(SCENARIOS.some((s) => /user|principal|leak/i.test(s.id)), false);
});

for (const id of EXPECTED_IDS) {
  test(`scenario ${id}: every expected result holds`, () => {
    const r = runScenario(id);
    const failed = r.checks.filter((c) => !c.pass).map((c) => `${c.path} ${c.op} ${c.wanted} (got ${c.actual})`);
    assert.deepEqual(failed, []);
    assert.equal(r.ok, true);
    for (const c of r.checks) assert.notEqual(c.actual, undefined, `${c.path} resolves to a value`);
  });
}

test('the check evaluator is not vacuous: a wrong expectation, a missing path and a type mismatch fail', () => {
  const result = { a: { n: 5, s: 'x', z: null } };
  const out = evaluate([
    { path: 'a.n', op: 'eq', value: 6 }, { path: 'a.n', op: 'gt', value: 9 }, { path: 'a.missing', op: 'eq', value: 1 },
    { path: 'a.s', op: 'gte', value: 0 }, { path: 'a.z', op: 'eq', value: 0 }, { path: 'a.missing', op: 'eq', value: undefined },
  ], result);
  assert.deepEqual(out.map((c) => c.pass), [false, false, false, false, false, false]);
  assert.equal(evaluate([{ path: 'a.z', op: 'eq', value: null }], result)[0].pass, true);
  assert.equal(getPath({ a: 1 }, '__proto__.x'), undefined);
});

test('the scenario numbers are the hand-written ones: pin the headline values independently of the expect lists', () => {
  const ttl = runScenario('ttl-expiry-misses').result;
  assert.equal(ttl.steps[0].expiresAt, 60_400);
  assert.deepEqual(ttl.steps.filter((s) => s.outcome).map((s) => s.outcome), ['miss', 'hit', 'miss']);
  const u = runScenario('usage-matches-calls').result.usage.a;
  assert.deepEqual([u.requests, u.fromCache, u.saved], [5, 3, 165]);
  const flip = runScenario('strictness-flips-the-pair').result.steps;
  assert.equal(flip[1].similarity, flip[3].similarity);
  assert.deepEqual([flip[1].outcome, flip[3].outcome], ['hit', 'miss']);
});

test('scenarios do not share state: running one twice gives the same result, and they do not interfere', () => {
  const a1 = JSON.stringify(runScenario('exact-repeat-hits'));
  runScenario('ttl-expiry-misses'); runScenario('store-outage-named-error');
  assert.equal(JSON.stringify(runScenario('exact-repeat-hits')), a1);
});

test('describeScenarios lists the data without results; an unknown id is null, including prototype names', () => {
  assert.equal(describeScenarios().length, 9);
  assert.ok(describeScenarios().every((s) => s.steps.length && s.expect.length && !('result' in s)));
  assert.equal(runScenario('nope'), null);
  assert.equal(findScenario('__proto__'), undefined);
});

test('a run of every scenario is deterministic', () => {
  assert.equal(JSON.stringify(SCENARIOS.map((s) => runScenario(s.id))), JSON.stringify(SCENARIOS.map((s) => runScenario(s.id))));
});
