import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPack } from './build-content-pack.mjs';
import { validatePack } from './validate-content-pack.mjs';
import { STORIES } from '../server/src/stories.js';
import { SCENARIOS } from '../server/src/scenarios.js';

const root = new URL('..', import.meta.url);
const committed = JSON.parse(fs.readFileSync(new URL('content-pack.json', root), 'utf8'));

test('the pack validates against the schema and its cross-references hold', () => {
  assert.deepEqual(validatePack(buildPack()), []);
});

test('the committed content-pack.json is exactly what the builder makes (no drift): run npm run content-pack', () => {
  assert.deepEqual(committed, buildPack());
});

test('every story has a try-it card that opens its scenario, and the pack carries the nine stories', () => {
  const pack = buildPack();
  assert.equal(pack.stories.length, 9);
  assert.equal(STORIES.length, SCENARIOS.length);
  for (const s of pack.stories) {
    const card = pack.cards.find((c) => c.story === s.id);
    assert.ok(card, s.id);
    assert.match(card.action.href, /^\/#cache\/[a-z-]+$/);
    assert.ok(SCENARIOS.some((sc) => card.action.href.endsWith(`/${sc.id}`)));
    assert.ok(fs.existsSync(new URL(s.file, root)), s.file);
  }
  assert.ok(pack.diagrams.some((d) => d.id === 'semantic-cache'));
});

test('a broken pack is caught: unknown term and unknown story', () => {
  const pack = buildPack();
  pack.cards[0].terms = ['nope'];
  pack.cards[1].story = 'ghost';
  const errors = validatePack(pack).join('\n');
  assert.match(errors, /unknown term nope/);
  assert.match(errors, /unknown story ghost/);
});

test('the pack claims only what the release notes say, names no real company or tenant, links nothing but localhost', () => {
  const t = JSON.stringify(buildPack());
  assert.match(t, /UNVERIFIED/);
  assert.ok(!/https?:\/\/(?!localhost)/.test(t), 'no outside link');
  assert.doesNotMatch(t, /rate.?limit|fallback/i);
  assert.match(t, /not a real embedding model/);
});
