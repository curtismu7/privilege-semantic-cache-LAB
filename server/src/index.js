import { installNetguard } from './netguard.js';
import { createApp, startHttpServer } from './app.js';
import { allPassed } from './doctor.js';
import { runChecks } from './checks.js';
import { allowedExtraHosts, assertBindAllowed, bindHost, resolvePort } from './safety.js';

// Zero real outbound: install before anything else can open a socket.
installNetguard();

try { allowedExtraHosts(process.env); } catch (e) { console.error(`[privilege-semantic-cache-lab] refusing to start: ${e.message}`); process.exit(1); }
const checks = runChecks();
if (!allPassed(checks)) {
  for (const c of checks.filter((x) => x.level === 'fail')) console.error(`[privilege-semantic-cache-lab] refusing to start: ${c.id}: ${c.detail}`);
  process.exit(1);
}
const host = assertBindAllowed(bindHost(), process.env);
const app = createApp();
const { url } = await startHttpServer({ port: resolvePort(), host, app });
console.log(`[privilege-semantic-cache-lab] page at ${url} (when built: npm run build), API at ${url}api/ (Mock only; bound to ${host}; port 7847 is PROVISIONAL, claimed provisionally and not registered on the board; no outbound call)`);
console.log(`[privilege-semantic-cache-lab] health: ${url}api/health`);
