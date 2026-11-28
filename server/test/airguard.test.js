// AirGuard Airlines (a fictional airline) is the default story. These tests fail on the old default (retail, Northwind Retail) and keep the
// retired names out of the default run: stories, talk track, scenarios (catalog and played results), diagram, the API and the shipped text.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DEFAULT_VERTICAL, VERTICALS, castFor, verticalFrom } from '../src/cast.js';
import { validateConfig, castForVertical, publicConfig } from '../src/customer.js';
import { buildStories } from '../src/stories.js';
import { buildTalkTrack } from '../src/talkTrack.js';
import { describeScenarios, scenarioIds, runScenario } from '../src/scenarios.js';
import { buildDiagram } from '../src/diagramData.js';
import { startLab } from './helpers.js';

const RETIRED = [/Meridian/i, /Skyline Air/i, /Northwind/i, /Fabrikam/i, /Contoso/i, /Harbor/i, /Vellum/i, /Tessera/i, /Larkspur/i, /orders-assistant/i, /order-support/i, /open order cases/i, /invoice/i];
const OTHER_BRANDS = ['Northwind Retail', 'Fabrikam Bank', 'Contoso Health'];
const leaks = (text) => RETIRED.filter((re) => re.test(text)).map(String);
const root = new URL('../../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');

test('the default vertical is airlines and a fresh config shows AirGuard Airlines', () => {
  assert.equal(DEFAULT_VERTICAL, 'airlines');
  const fresh = validateConfig({});
  assert.equal(fresh.config.vertical, 'airlines');
  assert.equal(fresh.config.cast.castBrand, 'AirGuard Airlines');
  assert.equal(VERTICALS.airlines.cast.castBrand, 'AirGuard Airlines');
  assert.equal(VERTICALS.airlines.label, 'Airlines');
});

test('an unknown or missing vertical falls back to the airline default and does not throw', () => {
  for (const bad of ['mining', '', undefined, null, 7, '__proto__']) assert.equal(verticalFrom(bad), 'airlines', String(bad));
  assert.equal(castFor('mining').castBrand, 'AirGuard Airlines');
  assert.equal(validateConfig({ vertical: 'mining' }).config.vertical, 'airlines');
});

test('a saved config that says retail, health or finance keeps its own pack, and nothing of AirGuard leaks into it', () => {
  for (const id of ['retail', 'health', 'finance']) {
    const c = validateConfig({ vertical: id });
    assert.deepEqual(c.warnings, [], id);
    assert.equal(c.config.vertical, id);
    assert.equal(c.config.cast.castBrand, VERTICALS[id].cast.castBrand);
    const text = JSON.stringify([buildStories(c.config.cast), buildTalkTrack(c.config.cast)]);
    assert.ok(text.includes(VERTICALS[id].cast.castBrand), id);
    assert.doesNotMatch(text, /AirGuard/, id);
  }
  assert.deepEqual(OTHER_BRANDS.map((b) => Object.values(VERTICALS).some((v) => v.cast.castBrand === b)), [true, true, true]);
});

test('the airline run carries none of the retired names: stories, talk track, scenarios (catalog and played), diagram', () => {
  const cast = castFor(DEFAULT_VERTICAL);
  const rendered = [buildStories(cast), buildTalkTrack(cast), describeScenarios(), scenarioIds().map((id) => runScenario(id)), buildDiagram(cast, 'semantic-cache')];
  const text = JSON.stringify(rendered);
  assert.ok(text.includes('AirGuard Airlines'));
  assert.deepEqual(leaks(text), []);
});

test('the default API answers carry AirGuard Airlines and no retired name', async () => {
  const lab = await startLab();
  try {
    const story = (await lab.get('/api/story')).json;
    assert.equal(story.vertical, 'airlines');
    assert.equal(story.cast.castBrand, 'AirGuard Airlines');
    assert.deepEqual(story.verticals.map((v) => v.id), ['airlines', 'finance', 'health', 'retail']);
    const text = [story, (await lab.get('/api/scenarios')).json, (await lab.get('/api/info')).json, (await lab.get('/api/diagram')).json].map((j) => JSON.stringify(j)).join('\n');
    assert.deepEqual(leaks(text), []);
    assert.equal((await lab.get('/api/story?vertical=retail')).json.cast.castBrand, 'Northwind Retail');
    assert.equal((await lab.get('/api/story?vertical=nope')).status, 400, 'an unknown pack in the picker is still refused');
  } finally { await lab.close(); }
});

test('the shipped text names the airline default and no retired name', () => {
  const example = JSON.parse(read('customer.config.example.json'));
  assert.equal(example.vertical, 'airlines');
  assert.equal(example.cast.brand, 'AirGuard Airlines');
  assert.equal(validateConfig(example).warnings.length, 0, 'the example is a valid config');
  assert.equal(castForVertical(validateConfig(example), undefined).vertical, 'airlines');
  assert.equal(publicConfig(validateConfig({})).verticals.length, 4);
  for (const f of ['README.md', 'docs/talk-track.md', 'customer.config.example.json']) {
    assert.deepEqual(leaks(read(f)), [], f);
    assert.match(read(f), /AirGuard Airlines|airlines/, f);
  }
  assert.deepEqual(leaks(read('content-pack.json')), [], 'the content pack (it carries no brand; the build fills the default pack)');
  assert.deepEqual(leaks(read('server/src/scenarios.js')), [], 'scenario prompts');
});
