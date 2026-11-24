// Every file copied byte for byte from the family's shared components matches the hash pinned beside it: a hand edit fails here.
// Change a shared component in AI-DEMO-Standalone first, then re-copy it and re-pin; never edit a vendored copy in this lab.
// (The run-observability pin has its own test, and the stylesheet pin its own script: scripts/check-ui-standard.sh.)
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

// pin file -> the folder its files live in. A pin line is `<hash>  <file>`, or `<hash>  shared/.../<file>`; gatewayTrace.js lives in server/src.
const GROUPS = [
  { pin: 'web/src/top-menu/top-menu.sha256', dir: 'web/src/top-menu', files: ['TopMenu.jsx', 'top-menu.css'], extra: ['ReleaseNotes.jsx'] },
  { pin: 'web/src/floating-dialog/floating-dialog.sha256', dir: 'web/src/floating-dialog', files: ['FloatingDialog.jsx', 'floating-dialog.css', 'floating-dialog.test.jsx', 'geometry.js', 'useFloatingPanel.js'] },
  { pin: 'web/src/diagram-kit/diagram-kit.sha256', dir: 'web/src/diagram-kit', files: ['DiagramKit.jsx', 'DiagramKit.test.jsx', 'diagram-kit.css', 'diagramKit.js', 'diagramKit.test.js'] },
  { pin: 'web/src/gateway-trace/gateway-trace.sha256', dir: 'web/src/gateway-trace', files: ['GatewayTrace.jsx', 'gateway-trace.css', 'gateway-trace.test.jsx'], server: { 'gatewayTrace.js': 'server/src/gatewayTrace.js' } },
  { pin: 'web/src/components/JsonPane.sha256', dir: 'web/src/components', files: ['JsonPane.jsx'] },
];

const pinned = (pinFile) => Object.fromEntries(fs.readFileSync(path.join(root, pinFile), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => { const [h, f] = l.split(/\s+/); return [path.basename(f), h]; }));

for (const g of GROUPS) {
  test(`vendored ${g.dir} matches ${path.basename(g.pin)}`, () => {
    const pins = pinned(g.pin);
    const want = [...g.files, ...Object.keys(g.server || {})].sort();
    assert.deepEqual(Object.keys(pins).sort(), want, 'the pin lists exactly the vendored files');
    for (const f of g.files) assert.equal(sha(path.join(root, g.dir, f)), pins[f], `${g.dir}/${f} was edited: change the shared component first, then re-vendor and re-pin`);
    for (const [f, where] of Object.entries(g.server || {})) assert.equal(sha(path.join(root, where)), pins[f], `${where} was edited`);
    for (const f of g.extra || []) assert.ok(fs.existsSync(path.join(root, g.dir, f)), `${g.dir}/${f} is part of the component (TopMenu imports it)`);
  });
}

test('JsonPane.css matches its own pin (a bare hash), and the vendored component test is present', () => {
  const dir = path.join(root, 'web/src/components');
  assert.equal(sha(path.join(dir, 'JsonPane.css')), fs.readFileSync(path.join(dir, 'JsonPane.css.sha256'), 'utf8').trim());
  assert.ok(fs.existsSync(path.join(dir, 'jsonpane.test.jsx')));
});

test('the shared stylesheet is the pinned copy (the canonical check runs in CI: scripts/check-ui-standard.sh)', () => {
  assert.equal(sha(path.join(root, 'web/src/standalone-ui.css')), fs.readFileSync(path.join(root, 'scripts/standalone-ui.sha256'), 'utf8').trim());
});

test('the talk-track dialog is the shared component (no hand-rolled dialog in the app)', () => {
  const dialog = fs.readFileSync(path.join(root, 'web/src/talk-track/TalkTrackDialog.jsx'), 'utf8');
  assert.match(dialog, /FloatingDialog/);
  for (const f of fs.readdirSync(path.join(root, 'web/src'), { recursive: true }).filter((n) => /\.jsx$/.test(n) && !/(floating-dialog|talk-track|top-menu|diagram-kit)/.test(n))) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, 'web/src', f), 'utf8'), /aria-modal|role=["']dialog["']/, `${f} hand-rolls a dialog`);
  }
});

test('the vendored canonical JsonPane is used for every JSON pane: no hand-rolled JSON.stringify in markup, no capped JSON pane', () => {
  for (const f of fs.readdirSync(path.join(root, 'web/src'), { recursive: true }).filter((n) => /\.jsx$/.test(n) && /^(pages|components)\//.test(n) && !/JsonPane|jsonpane/.test(n))) {
    const t = fs.readFileSync(path.join(root, 'web/src', f), 'utf8');
    assert.doesNotMatch(t, /<pre[^>]*>\s*\{\s*JSON\.stringify/, `${f}: a hand-rolled JSON pane`);
  }
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'web/src/app.css'), 'utf8'), /\.json[^{]*\{[^}]*(max-height|overflow:\s*(auto|scroll))/, 'a JSON pane is full view, never capped');
});
