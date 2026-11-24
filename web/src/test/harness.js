// A real lab server (the repo's own Express app, in process, on a loopback port) for the UI tests: the page talks to the genuine engine, so a test that
// clicks a scenario sees the genuine result. Nothing leaves the machine: the lab makes no outbound call.
import { createApp, startHttpServer } from "../../../server/src/app.js";
import { createHealth } from "../../../server/src/health.js";
import { validateConfig } from "../../../server/src/customer.js";
import { forgetWorkspace, workspaceId } from "../workspace.js";

// Starts the lab and points the page's fetch at it. `overrides` maps a path (no query) to a function (init, url, pass) => Response, to force a 4xx/5xx.
export async function startLab({ overrides = {}, customer = validateConfig({}) } = {}) {
  const health = createHealth({ demoId: "test", demoName: "test", runChecks: () => [], allPassed: () => true, intervalMs: 3_600_000 });
  const { server, url } = await startHttpServer({ port: 0, host: "127.0.0.1", app: createApp({ health, customer, log: () => {} }) });
  const base = url.replace(/\/$/, "");
  const nativeFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = (input, init = {}) => {
    const u = new URL(typeof input === "string" ? input : input.url, base);
    const body = init.body ? (() => { try { return JSON.parse(init.body); } catch { return init.body; } })() : undefined;
    calls.push({ method: init.method || "GET", path: u.pathname, search: u.search, body });
    const go = () => nativeFetch(u, { ...init, headers: { origin: base, ...(init.headers || {}) } });
    if (overrides[u.pathname]) { const r = overrides[u.pathname](init, u, go); if (r) return Promise.resolve(r); }
    return go();
  };
  forgetWorkspace();
  return {
    base, calls,
    ws: () => workspaceId(),
    json: (path) => nativeFetch(`${base}${path}`, { headers: { "x-workspace": workspaceId() } }).then((r) => r.json()),
    stop: async () => { globalThis.fetch = nativeFetch; health.stop(); await new Promise((res) => server.close(res)); },
  };
}

export const jsonResponse = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
