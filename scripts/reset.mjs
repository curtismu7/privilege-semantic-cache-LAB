#!/usr/bin/env node
// Reset a running lab. Usage: node scripts/reset.mjs [base-url] [workspace]   (default http://localhost:${PORT:-7847}, workspace "default")
// The workspace can also come from PSC_WORKSPACE. It clears exactly what the page's Reset clears, for that workspace only: its key settings (back to
// the default), its cache and Usage, its lab clock, the vector store switches and the mock model state, its run log and its last run. Other workspaces
// (other browser tabs) are not touched. Loopback only: refuses any other host. Needs the server already running; sends the same-origin header it requires.
import { pathToFileURL } from 'node:url';
import { isLoopbackHost } from '../server/src/safety.js';
import { DEFAULT_WORKSPACE, validWorkspace } from '../server/src/workspaces.js';

export async function reset(base = `http://localhost:${process.env.PORT || 7847}`, workspace = process.env.PSC_WORKSPACE || DEFAULT_WORKSPACE) {
  const u = new URL(base);
  if (!isLoopbackHost(u.hostname)) throw new Error(`refusing ${u.hostname}: loopback only`);
  if (!validWorkspace(workspace)) throw new Error('workspace must be 1 to 32 lowercase letters, digits and dashes, starting with a letter or digit');
  const r = await fetch(new URL('/api/reset', u), { method: 'POST', headers: { 'content-type': 'application/json', origin: u.origin, 'x-workspace': workspace }, body: '{}' });
  if (!r.ok) throw new Error(`reset failed: HTTP ${r.status}`);
  return r.json();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  reset(process.argv[2], process.argv[3]).then((j) => console.log(`reset: ${j.reset} (workspace ${j.workspace}, ${j.cleared} runs cleared)`), (e) => { console.error(e.message); process.exit(1); });
}
