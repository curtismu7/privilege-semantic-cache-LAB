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

test('shipped text names only reserved hosts (.example, .invalid, loopback)', () => {
  const ok = /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?|.*\.(example|invalid)|local\.ping-devops\.com)$/i;
  const bad = [];
  // CI workflow files name the CI tool's download host; they are not shipped lab text.
  for (const f of files().filter((x) => !x.includes(`${path.sep}.github${path.sep}`))) {
    const text = fs.readFileSync(f, 'utf8');
    for (const m of text.matchAll(/\bhttps?:\/\/([^\s/?#"'`<>\\)]+)/gi)) {
      const host = m[1].replace(/:\d+$/, '').replace(/^[^@]*@/, '');
      if (!ok.test(host) && !/[${}]/.test(host)) bad.push(`${path.relative(REPO_ROOT, f)}: ${host}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('no AI attribution in any file', () => {
  const pat = /[G]enerated with \[?[C]laude Code|[C]o-[A]uthored-[B]y:/i;
  const hits = files().filter((f) => !f.endsWith('check-no-ai-attribution.sh') && !f.endsWith('repo.test.js') && pat.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(hits, []);
});

test('the server never calls the network or a timer for lab time', () => {
  const src = walk(path.join(REPO_ROOT, 'server/src')).filter((f) => f.endsWith('.js') && !f.includes('model-gateway-sim') && !f.endsWith('netguard.js') && !f.endsWith('health.js'));
  for (const f of src) {
    const t = fs.readFileSync(f, 'utf8');
    assert.equal(/setTimeout|setInterval|Date\.now|new Date\(|Math\.random|\beval\(|new Function|node:vm/.test(t), false, path.relative(REPO_ROOT, f));
  }
});

test('the only dependency is express, and the package says Node 26', () => {
  const root = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  const server = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'server/package.json'), 'utf8'));
  assert.deepEqual(Object.keys(server.dependencies), ['express']);
  assert.equal(root.engines.node, '>=26');
  assert.deepEqual(root.workspaces, ['server']);
  assert.equal(/node --test test\/\*\.test\.js$/.test(server.scripts.test), true, 'a glob, never a directory');
});

test('the attribution check script passes in a git checkout', { skip: !fs.existsSync(path.join(REPO_ROOT, '.git')) }, () => {
  execFileSync('bash', [path.join(REPO_ROOT, 'scripts/check-no-ai-attribution.sh')], { stdio: 'pipe' });
});
