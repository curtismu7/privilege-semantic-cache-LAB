// Byte-for-byte pin of the vendored model-gateway-sim kit. The pin file lists `<sha256>  server/src/model-gateway-sim/<file>`
// relative to the repo root. Returns the list of problems (empty = pinned).
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PIN_FILE = path.join(REPO_ROOT, 'server/test/model-gateway-sim.sha256');
export const KIT_FILES = ['labClock.js', 'providerStub.js', 'llmKey.js'];

export function checkPin({ root = REPO_ROOT, pinFile = PIN_FILE } = {}) {
  const problems = [];
  const lines = fs.readFileSync(pinFile, 'utf8').split('\n').filter(Boolean);
  const pinned = new Map(lines.map((l) => { const [hash, ...rest] = l.split(/\s+/); return [rest.join(' '), hash]; }));
  for (const f of KIT_FILES) {
    const rel = `server/src/model-gateway-sim/${f}`;
    if (!pinned.has(rel)) { problems.push(`${rel}: not in the pin file`); continue; }
    let actual;
    try { actual = createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex'); } catch { problems.push(`${rel}: missing`); continue; }
    if (actual !== pinned.get(rel)) problems.push(`${rel}: edited (hash differs from the pin)`);
  }
  for (const rel of pinned.keys()) if (!KIT_FILES.some((f) => rel === `server/src/model-gateway-sim/${f}`)) problems.push(`${rel}: pinned but not a kit file`);
  return problems;
}
