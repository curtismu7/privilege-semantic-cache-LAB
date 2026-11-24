import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('the files the standalone rules ask for are present', () => {
  for (const f of ['README.md', 'CLAUDE.md', 'LICENSE', 'Dockerfile', 'docker-compose.yml', '.dockerignore', '.github/workflows/ci.yml', 'docs/spec.md', 'docs/talk-track.md', 'docs/safety.md', 'docs/shelf-entry.json', 'docs/content-pack.schema.json', 'customer.config.example.json', 'content-pack.json', 'scripts/doctor.mjs', 'scripts/reset.mjs', 'scripts/check-ui-standard.sh', 'scripts/standalone-ui.sha256', 'web/src/standalone-ui.css', '.env.example', '.gitignore']) {
    assert.ok(fs.existsSync(path.join(root, f)), f);
  }
});

// The shelf's tag taxonomy at the time of writing (demo-shelf-LAB data/tags.json). A snapshot, so the test is portable; when a sibling demo-shelf-LAB clone exists it is checked too.
const SHELF_TAGS = ['pingone', 'pingid', 'pingone-authorize', 'pingone-protect', 'pingone-davinci', 'pingone-privilege', 'agent-gateway', 'pingone-mcp', 'pingfederate', 'pinggateway', 'ai-agent-security', 'mcp-security', 'tool-poisoning', 'agent-identity', 'authorization-policy', 'human-in-the-loop', 'agent-controls', 'sign-in-and-mfa', 'token-security', 'audit-observability', 'learning', 'workload-identity', 'federation', 'jwt', 'jwks', 'pass-agent-token', 'poc-patterns', 'simulated', 'real', 'oauth', 'oidc', 'token-exchange', 'id-jag', 'dpop', 'mtls', 'par', 'ciba', 'step-up', 'rfc9728', 'fapi', 'mcp', 'a2a', 'cimd', 'cedar', 'mcp-server-built', 'aws', 'aws-agentcore', 'aws-bedrock'];

test('the shelf entry is valid and portable: the registry\'s field rules, port 7847 (provisional), a placeholder catalog id, a relative composeFile, tags from the taxonomy', () => {
  const doc = JSON.parse(read('docs/shelf-entry.json'));
  assert.equal(doc.demos.length, 1);
  const e = doc.demos[0];
  assert.match(e.id, /^[a-z0-9-]{2,41}$/); assert.equal(e.id, 'privilege-semantic-cache-lab');
  assert.ok(e.name.length > 0 && e.name.length <= 300);
  assert.ok(e.description.length > 0 && e.description.length <= 300, `description is ${e.description.length} characters`);
  assert.equal(e.kind, 'Demo');
  assert.equal(e.healthPath, '/api/health');
  assert.equal(e.url, 'http://localhost:7847');
  assert.match(e.catalogId, /^D\d+$/);
  assert.equal(e.catalogId, 'D000', 'a placeholder: the owner assigns the real catalog id and port before the registry PR');
  assert.deepEqual(e.pingProducts, []);
  assert.deepEqual(e.composeOverlays, []);
  assert.equal(e.where, 'installed');
  assert.equal(e.repo, 'https://github.com/curtismu7/privilege-semantic-cache-LAB');
  assert.match(e.addedAt, /^\d{4}-\d{2}-\d{2}$/); assert.ok(Date.parse(`${e.addedAt}T00:00:00Z`) <= Date.now() + 14 * 3600 * 1000, 'addedAt is not in the future');
  assert.equal(e.composeFile, 'privilege-semantic-cache-LAB/docker-compose.yml');
  assert.ok(!path.isAbsolute(e.composeFile) && !e.composeFile.includes('..') && /\.ya?ml$/.test(e.composeFile) && !/[;&|$`\s]/.test(e.composeFile), 'composeFile must be relative with no shell characters');
  assert.ok(Array.isArray(e.tags) && e.tags.length >= 1 && e.tags.length <= 20 && new Set(e.tags).size === e.tags.length);
  for (const t of e.tags) assert.ok(SHELF_TAGS.includes(t), `tag ${t} is not in the shelf taxonomy`);
  assert.ok(e.tags.includes('simulated'));
  assert.ok(!/\/Users\//.test(JSON.stringify(e)), 'no absolute home path');
  assert.ok(fs.existsSync(path.join(root, 'docker-compose.yml')));
  const sibling = path.join(root, '..', 'demo-shelf-LAB', 'data', 'tags.json');
  if (fs.existsSync(sibling)) {
    const ids = new Set(JSON.parse(fs.readFileSync(sibling, 'utf8')).groups.flatMap((g) => g.tags.map((t) => t.id)));
    for (const t of e.tags) assert.ok(ids.has(t), `tag ${t} is not in ${sibling}`);
  }
});

test('customer.config.json is git-ignored, and its example sets only branding and the five cast words', () => {
  assert.match(read('.gitignore'), /^customer\.config\.json$/m);
  const ex = JSON.parse(read('customer.config.example.json'));
  assert.deepEqual(Object.keys(ex.cast).sort(), ['app', 'brand', 'keyName', 'owner', 'task']);
  assert.deepEqual(Object.keys(ex).filter((k) => !k.startsWith('_')).sort(), ['cast', 'name', 'tagline', 'vertical']);
});

test('CI: build, tests and the UI-standard check, doctor with the content pack, forbidden strings, attribution and gitleaks', () => {
  const ci = read('.github/workflows/ci.yml');
  for (const job of ['build:', 'test:', 'doctor:', 'forbidden-strings:', 'gitleaks:']) assert.match(ci, new RegExp(`^  ${job}`, 'm'), job);
  assert.match(ci, /run: npm run build/);
  assert.match(ci, /run: bash scripts\/check-ui-standard\.sh/);
  assert.match(ci, /validate-content-pack\.mjs/);
  assert.match(ci, /check-no-ai-attribution\.sh/);
  assert.match(ci, /node-version: 26/);
  assert.doesNotMatch(ci, /node-version: (?!26)/);
});

test('the root package builds the web workspace and runs every test suite', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.deepEqual(pkg.workspaces, ['server', 'web']);
  assert.equal(pkg.scripts.build, 'npm run build -w web');
  assert.match(pkg.scripts.test, /npm test -w server/); assert.match(pkg.scripts.test, /npm test -w web/); assert.match(pkg.scripts.test, /node --test scripts\/\*\.test\.mjs/);
  assert.equal(pkg.engines.node, '>=26');
});

test('the README says it is a Demo, names the provisional port and where the run leaves logs (rule 27)', () => {
  const readme = read('README.md');
  assert.match(readme, /Tier: Demo/);
  assert.match(readme, /7847/);
  assert.match(readme, /Observability/i);
  assert.match(readme, /stdout|standard output/i);
});
