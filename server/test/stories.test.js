import test from 'node:test';
import assert from 'node:assert/strict';
import { STORIES, scanStories, buildStories } from '../src/stories.js';
import { VERTICALS, CAST_KEYS, tokensIn, unfilled, castFor } from '../src/cast.js';
import { loadTalkTrack, buildTalkTrack } from '../src/talkTrack.js';
import { validateConfig, castForVertical, loadCustomerConfig, publicConfig } from '../src/customer.js';
import { SCENARIOS, runScenario } from '../src/scenarios.js';
import { startLab } from './helpers.js';

test('three vertical packs define the same cast keys, all plain text', () => {
  assert.deepEqual(Object.keys(VERTICALS).sort(), ['finance', 'health', 'retail']);
  for (const v of Object.values(VERTICALS)) {
    assert.deepEqual(Object.keys(v.cast).sort(), [...CAST_KEYS].sort(), v.id);
    for (const [k, t] of Object.entries(v.cast)) assert.ok(typeof t === 'string' && t.length > 0 && !/[<>{}]|:\/\//.test(t), `${v.id}.${k}`);
  }
});

test('every token a story or a talk-track section uses is defined by every vertical pack (a test fails on an undefined token)', () => {
  const talk = Object.fromEntries(loadTalkTrack().map((t) => [`talk-track ${t.id}`, t]));
  const scan = scanStories(STORIES, VERTICALS, talk);
  assert.deepEqual(scan.missing, []);
  assert.ok(scan.tokens.length >= 4, 'the stories really use {{cast}} tokens');
});

test('the check does fail on an undefined token and an unfilled one is left visible', () => {
  const bad = scanStories([{ id: 'S99', title: 'x {{castNope}}' }], VERTICALS);
  assert.match(bad.missing.join(), /S99 uses \{\{castNope\}\} which retail lacks/);
  assert.deepEqual([...tokensIn({ a: ['{{ castBrand }}', { b: '{{castKey}}' }] })].sort(), ['castBrand', 'castKey']);
  assert.deepEqual(unfilled({ a: '{{castBrand}} {{nope}}' }, castFor('retail')), ['nope']);
});

test('nine stories, one per scenario, each with its own talk-track section; the story names a scenario that passes its expectation', () => {
  assert.equal(STORIES.length, 9);
  assert.deepEqual(STORIES.map((s) => s.scenario).sort(), SCENARIOS.map((s) => s.id).sort());
  const sections = new Set(loadTalkTrack().map((t) => t.id));
  for (const s of STORIES) {
    assert.match(s.id, /^S\d{2}$/);
    assert.ok(sections.has(s.id), `${s.id} has a talk-track section`);
    assert.equal(runScenario(s.scenario).ok, true, s.scenario);
  }
});

test('stories are filled for the picked vertical and never leave a token behind', () => {
  for (const v of Object.values(VERTICALS)) {
    const filled = JSON.stringify([buildStories(v.cast), buildTalkTrack(v.cast)]);
    assert.doesNotMatch(filled, /\{\{/, v.id);
    assert.ok(filled.includes(v.cast.castBrand), v.id);
  }
});

test('the talk track says what is sourced and never overclaims', () => {
  const text = loadTalkTrack().map((t) => t.say).join('\n');
  assert.match(text, /2026-11-21 release notes/);
  assert.match(text, /UNVERIFIED/);
  assert.match(text, /not a real embedding model/);
  assert.match(text, /open question/);
});

test('customer.config (rule 12): bad fields fall back to defaults with a warning, never a throw; markup and links are refused', () => {
  const ok = validateConfig({ name: 'Acme Test', vertical: 'health', cast: { brand: 'Acme Test', keyName: 'acme-key' } });
  assert.equal(ok.config.name, 'Acme Test'); assert.equal(ok.config.cast.castBrand, 'Acme Test'); assert.equal(ok.config.cast.castKey, 'acme-key'); assert.deepEqual(ok.warnings, []);
  const bad = validateConfig({ name: '<script>', vertical: 'mining', cast: { keyName: 'Bad Key!', app: 'see https://evil.example', extra: 'x' }, other: 1 });
  assert.equal(bad.config.name, 'Privilege Semantic Cache LAB');
  assert.equal(bad.config.vertical, 'retail');
  assert.ok(bad.warnings.length >= 5, bad.warnings.join('; '));
  assert.deepEqual(validateConfig('nope').config.vertical, 'retail');
  assert.match(loadCustomerConfig({ file: '/nonexistent/customer.config.json', env: {} }).config.name, /Semantic Cache LAB/);
  assert.equal(castForVertical(ok, 'finance').vertical, 'finance');
  assert.equal(castForVertical(ok, 'nope'), null);
  assert.equal(publicConfig(ok).verticals.length, 3);
});

test('GET /api/story: the vertical picker, the configured brand on its own vertical, a 400 for an unknown vertical', async () => {
  const customer = validateConfig({ vertical: 'health', cast: { brand: 'Test Brand Co' } });
  const lab = await startLab({ customer });
  try {
    const mine = (await lab.get('/api/story')).json;
    assert.equal(mine.vertical, 'health'); assert.equal(mine.cast.castBrand, 'Test Brand Co');
    assert.equal(mine.stories.length, 9); assert.equal(mine.verticals.length, 3);
    assert.ok(mine.talkTrack.every((t) => t.id && t.title && t.say));
    const other = (await lab.get('/api/story?vertical=finance')).json;
    assert.equal(other.cast.castBrand, VERTICALS.finance.cast.castBrand, 'another pack never carries the customer\'s brand');
    const bad = await lab.get('/api/story?vertical=__proto__');
    assert.deepEqual([bad.status, bad.json.error], [400, 'unknown_vertical']);
    assert.equal((await lab.send('POST', '/api/story', {})).status, 404, 'a write to a read-only path is a JSON 404, never HTML');
  } finally { await lab.close(); }
});
