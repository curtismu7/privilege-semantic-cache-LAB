import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { DIAGRAM_NAMES, buildDiagram, hasDiagram, rawDiagram, diagramProblems } from '../src/diagramData.js';
import { castFor } from '../src/cast.js';
import { startLab } from './helpers.js';

const dir = new URL('../diagrams/', import.meta.url);

test('the diagram is diagram-studio/1 data, loaded by name, valid under the studio\'s own checks, and its file matches the pin', () => {
  assert.deepEqual(DIAGRAM_NAMES, ['semantic-cache']);
  const doc = rawDiagram('semantic-cache');
  assert.deepEqual(diagramProblems(doc), []);
  assert.equal(doc.schema, 'diagram-studio/1'); assert.equal(doc.id, 'semantic-cache');
  const pin = fs.readFileSync(new URL('diagrams.sha256', dir), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/));
  assert.deepEqual(pin.map(([, f]) => f), ['semantic-cache.json']);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(new URL('semantic-cache.json', dir))).digest('hex'), pin[0][0], 'the data file was edited: re-export it from diagram-studio and re-pin');
  assert.deepEqual(fs.readdirSync(dir).sort(), ['diagrams.sha256', 'semantic-cache.json'], 'no other diagram file hides here');
  assert.match(fs.readFileSync(new URL('diagrams.sha256', dir), 'utf8'), /[0-9a-f]{40}/, 'the pin names the diagram-studio commit it was exported from');
});

test('the shape the page reads has one step per arrow, in the data\'s order, with the boxes\' own positions', () => {
  const d = buildDiagram(castFor('retail'), 'semantic-cache');
  const raw = rawDiagram('semantic-cache');
  assert.equal(d.steps.length, raw.steps.flatMap((s) => s.edges).length);
  assert.deepEqual(d.nodes.map((n) => [n.id, n.x, n.y]), raw.nodes.map((n) => [n.id, n.x, n.y]));
  for (const s of d.steps) assert.ok(d.nodes.some((n) => n.id === s.from) && d.nodes.some((n) => n.id === s.to));
  assert.ok(d.steps.every((s) => s.label && s.title && s.say));
  assert.ok(d.steps.every((s) => !/^\d/.test(s.label)), 'the page numbers the arrows, so a label carries no number of its own');
  assert.equal(d.steps[0].label, 'prompt');
  assert.ok(d.nodes.length >= 5);
});

test('only a numbering prefix is stripped, and only when every label of the diagram carries one', () => {
  const raw = rawDiagram('semantic-cache');
  const real = buildDiagram(castFor('retail'), 'semantic-cache');
  assert.ok(real.steps.some((s) => /^hit above/.test(s.label)), '"4a hit above..." loses its "4a"');
  // A label that merely starts with a number keeps it when the labels are not all numbered.
  assert.ok(raw.edges.every((e) => /^\d+[a-z]?\s/.test(e.label)), 'the data numbers every label');
});

test('the diagram text keeps the honesty: sourced claim stated, the rest labelled lab model or UNVERIFIED, the encoder is a stand-in', () => {
  const text = JSON.stringify(rawDiagram('semantic-cache'));
  assert.match(text, /release notes/); assert.match(text, /UNVERIFIED/); assert.match(text, /lab model/i);
  assert.match(text, /not a real embedding model/);
});

test('GET /api/diagram by name; default name; an unknown name is a 404 and never reads a path; a bad vertical is a 400', async () => {
  const lab = await startLab();
  try {
    const a = (await lab.get('/api/diagram?name=semantic-cache')).json;
    assert.equal(a.name, 'semantic-cache'); assert.ok(a.steps.length >= 6);
    assert.equal((await lab.get('/api/diagram')).json.name, 'semantic-cache');
    for (const bad of ['nope', '../package', '..%2Fpackage', 'semantic-cache.json', '__proto__', 'constructor']) {
      const r = await lab.get(`/api/diagram?name=${bad}`);
      assert.deepEqual([r.status, r.json.error], [404, 'unknown_diagram'], bad);
    }
    assert.equal((await lab.get('/api/diagram?name[]=x')).status, 404);
    assert.equal((await lab.get('/api/diagram?vertical=nope')).status, 400);
    assert.equal(hasDiagram('toString'), false);
  } finally { await lab.close(); }
});
