import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startLab } from './helpers.js';

test('without a web build the API still works and a page request is a JSON 404 that says why (the tests never need web/dist)', async () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'psc-nodist-'));
  const lab = await startLab({ distDir: empty });
  try {
    assert.equal((await lab.get('/api/info')).status, 200);
    const page = await lab.get('/');
    assert.deepEqual([page.status, page.json.error], [404, 'not_found']);
    assert.match(page.json.message, /not built/);
  } finally { await lab.close(); fs.rmSync(empty, { recursive: true, force: true }); }
});

test('with a web build: / and any page path serve index.html (a missing asset is a 404), assets are served, /api stays JSON, security headers are set', async () => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'psc-dist-'));
  fs.mkdirSync(path.join(dist, 'assets'));
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>t</title><div id="root"></div>');
  fs.writeFileSync(path.join(dist, 'assets', 'a.js'), 'export {}');
  const lab = await startLab({ distDir: dist });
  try {
    const root = await lab.get('/');
    assert.equal(root.status, 200); assert.match(root.text, /id="root"/);
    assert.match(root.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(root.headers.get('x-content-type-options'), 'nosniff');
    assert.equal((await lab.get('/some/page')).status, 200);
    assert.equal((await lab.get('/assets/a.js')).status, 200);
    const miss = await lab.get('/assets/missing.js');
    assert.deepEqual([miss.status, miss.json.error], [404, 'not_found'], 'a missing asset is a JSON 404, never the page');
    const api = await lab.get('/api/nope');
    assert.deepEqual([api.status, api.json.error], [404, 'not_found']);
    assert.equal((await lab.get('/api')).status, 404);
    assert.equal((await lab.get('/api/health')).json.schema, 'demo-health/1');
    assert.equal((await lab.get('/..%2f..%2fpackage.json')).status === 200 && (await lab.get('/..%2f..%2fpackage.json')).text.includes('"workspaces"'), false, 'no path traversal out of dist');
  } finally { await lab.close(); fs.rmSync(dist, { recursive: true, force: true }); }
});

test('a lab installed under a dot-directory (~/.local, .cache, .worktrees) still serves the built page and its assets', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'psc-dot-'));
  const dist = path.join(tmp, '.apps', 'lab', 'web', 'dist');
  fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>t</title><div id="root"></div>');
  fs.writeFileSync(path.join(dist, 'assets', 'a.js'), 'export {}');
  const lab = await startLab({ distDir: dist });
  try {
    for (const p of ['/', '/some/page', '/#cache']) {
      const r = await lab.get(p);
      assert.equal(r.status, 200, p);
      assert.match(r.text, /id="root"/, p);
    }
    assert.equal((await lab.get('/assets/a.js')).status, 200);
    assert.equal((await lab.get('/assets/missing.js')).status, 404, 'a missing asset is still a 404, never the page');
  } finally { await lab.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
});
