import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { allowedExtraHosts, resolvePort } from '../server/src/safety.js';

// null when the server accepts the port; the lab's ports live in the packed range 7800-7999.
const portProblem = (p) => { try { resolvePort({ PORT: String(p) }); } catch (e) { return e.message; } return p >= 7800 && p <= 7999 ? null : `${p} is outside 7800-7999`; };

// Every published port must be bound to loopback on the host. A small line parser (no YAML dependency).
export function publishedPorts(text) {
  const out = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)ports:\s*$/.exec(lines[i]);
    if (!m) continue;
    for (let j = i + 1; j < lines.length; j++) {
      const item = /^\s*-\s*["']?([^"'\s#]+)["']?/.exec(lines[j]);
      if (!item || lines[j].search(/\S/) <= m[1].length) break;
      out.push(item[1]);
    }
  }
  return out;
}
const here = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('docker-compose.yml publishes only on 127.0.0.1', () => {
  const ports = publishedPorts(here('docker-compose.yml'));
  assert.deepEqual(ports, ['127.0.0.1:${HOST_PORT:-7847}:7847']);
  for (const p of ports) assert.match(p, /^127\.0\.0\.1:/, `${p} must start with 127.0.0.1:`);
});

test('the parser flags an unbound or wildcard publish', () => {
  for (const bad of ['- "7847:7847"', '- "0.0.0.0:7847:7847"', '- 7847', '- "::1:7847:7847"']) {
    const ports = publishedPorts(`services:\n  a:\n    ports:\n      ${bad}\n`);
    assert.equal(ports.length, 1);
    assert.doesNotMatch(ports[0], /^127\.0\.0\.1:/);
  }
});

test('compose default host port and Dockerfile port are allowed ports and agree (7847, provisional)', () => {
  const compose = here('docker-compose.yml');
  const host = Number(/\$\{HOST_PORT:-(\d+)\}/.exec(compose)[1]);
  assert.equal(host, 7847);
  assert.equal(portProblem(host), null);
  const docker = here('Dockerfile');
  const port = Number(/^EXPOSE (\d+)/m.exec(docker)[1]);
  assert.equal(port, 7847);
  assert.equal(portProblem(port), null);
  assert.match(compose, new RegExp(`:${port}"`));
  assert.match(compose, /PORT: "7847"/);
  assert.match(docker, /^ENV PSC_BIND=0\.0\.0\.0$/m);
});

test('the container is non-root and locked down: USER node, read-only fs, no capabilities, no new privileges', () => {
  const compose = here('docker-compose.yml');
  assert.match(here('Dockerfile'), /^USER node$/m);
  assert.match(compose, /read_only: true/);
  assert.match(compose, /cap_drop: \[ALL\]/);
  assert.match(compose, /no-new-privileges:true/);
});

test('the long-running service restarts unless stopped (rule 21) and has a healthcheck on /api/health', () => {
  const compose = here('docker-compose.yml');
  assert.match(compose, /^\s+restart: unless-stopped$/m);
  const hc = /healthcheck:[\s\S]*?test: \[(.*)\]/.exec(compose);
  assert.ok(hc, 'a healthcheck is defined');
  assert.match(hc[1], /127\.0\.0\.1:7847\/api\/health/);
  assert.match(hc[1], /demo-health\/1/);
});

test('the image builds the web app, serves web/dist, ships the diagram data and the talk track, and installs no dev dependency at run time', () => {
  const docker = here('Dockerfile');
  assert.match(docker, /npm run build -w web/);
  assert.match(docker, /COPY --from=build \/app\/web\/dist web\/dist/);
  assert.match(docker, /COPY server\/diagrams server\/diagrams/);
  assert.match(docker, /COPY docs\/talk-track\.md docs\/talk-track\.md/);
  assert.match(docker, /npm ci --omit=dev -w server/);
  assert.match(docker, /^FROM node:26-alpine/m);
});

test('compose never mounts the Docker socket and passes no log-reader settings', () => {
  const compose = here('docker-compose.yml');
  assert.doesNotMatch(compose, /docker\.sock/);
  assert.doesNotMatch(compose, /RUN_OBS_/);
});

test('LAB_ALLOWED_HOSTS defaults to the lab-proxy names (so the Host check does not answer 421 behind the proxy), every one a valid host name', () => {
  const def = /LAB_ALLOWED_HOSTS: \$\{LAB_ALLOWED_HOSTS:-([^}]*)\}/.exec(here('docker-compose.yml'))[1].split(',').filter(Boolean);
  assert.ok(def.includes('local.ping-devops.com') && def.includes('privilege-semantic-cache-lab.local.ping-devops.com'), `default is: ${def.join(',') || '(empty)'}`);
  assert.equal(allowedExtraHosts({ LAB_ALLOWED_HOSTS: def.join(',') }).size, 2);
});
