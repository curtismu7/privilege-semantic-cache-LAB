import test from 'node:test';
import assert from 'node:assert/strict';
import { runChecks } from '../src/checks.js';
import { allPassed } from '../src/doctor.js';
import { SCENARIOS } from '../src/scenarios.js';
import { BANNER, OPEN_QUESTIONS, UNVERIFIED } from '../src/banner.js';

test('every doctor check passes, and every scenario has its own check', () => {
  const checks = runChecks({});
  assert.equal(allPassed(checks), true, JSON.stringify(checks.filter((c) => c.level === 'fail')));
  for (const sc of SCENARIOS) assert.equal(checks.find((c) => c.id === `scenario:${sc.id}`)?.level, 'pass', sc.id);
  for (const id of ['node', 'banner', 'bind', 'kit-pin', 'config-validation', 'open-questions']) assert.ok(checks.find((c) => c.id === id), id);
});

test('doctor fails on a reserved port', () => {
  assert.equal(runChecks({ PORT: '8080' }).find((c) => c.id === 'bind').level, 'fail');
});

test('the banner says what is simulated, that the encoder is not a real embedding model, and that the rest is unverified', () => {
  assert.match(BANNER, /SIMULATED/);
  assert.match(BANNER, /2026-11-21/);
  assert.match(BANNER, /UNVERIFIED/);
  assert.match(BANNER, /NOT a real embedding model/);
});

test('the UNVERIFIED list names how Saved is computed, the cache scope, the guard order and the Redis outage behaviour', () => {
  const text = UNVERIFIED.join('\n');
  for (const re of [/Saved is computed/, /Cache scope/, /Guard order/, /Redis outage behaviour/]) assert.match(text, re);
});

test('the per-user cache scope is an open-question card with no result', () => {
  const q = OPEN_QUESTIONS.find((x) => x.id === 'cache-scope-per-user');
  assert.ok(q);
  assert.equal(q.result, null);
  assert.equal(q.status, 'open');
  assert.match(q.question, /two different users/);
});
