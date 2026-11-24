import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KIT_FILES, PIN_FILE, REPO_ROOT, checkPin } from '../src/pin.js';

test('the vendored model-gateway-sim files match the pin, byte for byte', () => {
  assert.deepEqual(checkPin(), []);
});

test('the pin file names exactly the three kit files', () => {
  const names = fs.readFileSync(PIN_FILE, 'utf8').split('\n').filter(Boolean).map((l) => l.split(/\s+/)[1]).sort();
  assert.deepEqual(names, KIT_FILES.map((f) => `server/src/model-gateway-sim/${f}`).sort());
});

test('an edited, removed or extra file is caught', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'psc-pin-'));
  try {
    const dir = path.join(tmp, 'server/src/model-gateway-sim');
    fs.mkdirSync(dir, { recursive: true });
    for (const f of KIT_FILES) fs.copyFileSync(path.join(REPO_ROOT, 'server/src/model-gateway-sim', f), path.join(dir, f));
    assert.deepEqual(checkPin({ root: tmp }), []);
    fs.appendFileSync(path.join(dir, 'labClock.js'), '\n// edited\n');
    assert.match(checkPin({ root: tmp }).join(), /labClock.js: edited/);
    fs.rmSync(path.join(dir, 'llmKey.js'));
    assert.match(checkPin({ root: tmp }).join(), /llmKey.js: missing/);
    const extra = path.join(tmp, 'pin.sha256');
    fs.writeFileSync(extra, `${fs.readFileSync(PIN_FILE, 'utf8')}${'0'.repeat(64)}  server/src/model-gateway-sim/other.js\n`);
    assert.match(checkPin({ root: tmp, pinFile: extra }).join(), /other.js: pinned but not a kit file/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('the kit clock still refuses a backwards set (the lab relies on it)', async () => {
  const { createClock } = await import('../src/model-gateway-sim/labClock.js');
  const c = createClock(10);
  assert.throws(() => c.set(9), /backwards/);
  assert.throws(() => c.advance(-1), RangeError);
  assert.throws(() => createClock(-1), RangeError);
});
