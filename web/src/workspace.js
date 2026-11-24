// Rule 13: each browser tab gets its own workspace id, kept in sessionStorage, and sends it as X-Workspace on every API call
// that touches server state. Storage can be blocked, so a failure falls back to a per-load id.
const KEY = "psc.workspace";
// The server's own pattern (server/src/workspaces.js): 1 to 32 lowercase letters, digits and dashes, starting with a letter or digit.
export const SERVER_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
let memo = null;

export function workspaceId() {
  if (memo) return memo;
  try { const saved = window.sessionStorage.getItem(KEY); if (saved && SERVER_PATTERN.test(saved)) return (memo = saved); } catch { /* blocked */ }
  const bytes = new Uint8Array(8);
  // Without window.crypto the bytes are filled IN PLACE (a typed array's map() returns a new array and would leave these bytes zero).
  (window.crypto || { getRandomValues: (a) => { for (let i = 0; i < a.length; i += 1) a[i] = Math.floor(Math.random() * 256); return a; } }).getRandomValues(bytes);
  memo = `w-${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  try { window.sessionStorage.setItem(KEY, memo); } catch { /* blocked */ }
  return memo;
}

// The server announces a workspace it had to build with X-Workspace-Fresh: 1. A tab that has already used its id is told by that header that the server
// forgot the workspace (the 20-workspace cap, a restart): the page says so and reloads its state. After this tab's own Reset the next call is fresh on purpose.
export const FORGOTTEN_EVENT = "psc:workspace-forgotten";
let seen = false;
let expectFresh = false;
export function noteResponse(res) {
  const fresh = res?.headers?.get?.("x-workspace-fresh") === "1";
  if (fresh) {
    if (seen && !expectFresh && typeof window !== "undefined") window.dispatchEvent(new Event(FORGOTTEN_EVENT));
    expectFresh = false;
  }
  if (res && res.status < 500) seen = true;
}
export const expectFreshWorkspace = () => { expectFresh = true; };

export const workspaceFetch = async (url, opts = {}) => {
  const res = await fetch(url, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}), "x-workspace": workspaceId() } });
  noteResponse(res);
  return res;
};

// For tests: a new tab starts with a new id.
export function forgetWorkspace() { memo = null; seen = false; expectFresh = false; try { window.sessionStorage.removeItem(KEY); } catch { /* blocked */ } }
