import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { REPO_ROOT } from '../src/pin.js';

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};
const files = () => walk(REPO_ROOT).filter((f) => /\.(js|mjs|json|md|sh|yml|sha256)$/.test(f) && !f.endsWith('package-lock.json'));

// Lab time is the kit's lab clock: the engine files never read the wall clock or a timer. Everything under server/src may not use timers,
// randomness or dynamic code (the shared health.js and the netguard are the only exceptions). The wall clock is read only by the files that
// stamp a stdout line or a run record (app.js, runObs.js), never by the engine.
const ENGINE = ['encoder.js', 'cache.js', 'path.js', 'scenarios.js', 'session.js', 'state.js', 'bounds.js', 'checks.js', 'errors.js'];
test('the server never calls the network or a timer for lab time, and the engine never reads the wall clock', () => {
  const src = walk(path.join(REPO_ROOT, 'server/src')).filter((f) => f.endsWith('.js') && !f.includes('model-gateway-sim') && !f.endsWith('netguard.js') && !f.endsWith('health.js') && !f.endsWith('runObservability.js'));
  for (const f of src) {
    const t = fs.readFileSync(f, 'utf8');
    assert.equal(/setTimeout|setInterval|Math\.random|\beval\(|new Function|node:vm/.test(t), false, path.relative(REPO_ROOT, f));
    if (ENGINE.includes(path.basename(f))) assert.equal(/Date\.now|new Date\(/.test(t), false, `${path.relative(REPO_ROOT, f)} reads the wall clock`);
  }
});

test('the server\'s only dependency is express, and the package says Node 26', () => {
  const root = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  const server = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'server/package.json'), 'utf8'));
  assert.deepEqual(Object.keys(server.dependencies), ['express']);
  assert.equal(root.engines.node, '>=26');
  assert.deepEqual(root.workspaces, ['server', 'web']);
  assert.equal(/node --test test\/\*\.test\.js$/.test(server.scripts.test), true, 'a glob, never a directory');
});

test('the attribution check script passes in a git checkout', { skip: !fs.existsSync(path.join(REPO_ROOT, '.git')) }, () => {
  execFileSync('bash', [path.join(REPO_ROOT, 'scripts/check-no-ai-attribution.sh')], { stdio: 'pipe' });
});
