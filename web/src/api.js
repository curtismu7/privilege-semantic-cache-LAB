import { expectFreshWorkspace, workspaceFetch } from "./workspace";

// Every call returns { ok, status, body } and never throws: a refusal (400, 403, 409) is data with a code and a message, and a body that is not JSON
// (a proxy's 502 page) becomes { error, message } so the page always has a sentence to show (rule 23).
const asBody = (r, body) => (body && typeof body === "object" ? body : { error: "bad_response", message: `The lab answered HTTP ${r.status} without a JSON body` });
async function call(method, url, payload) {
  let r;
  try { r = await workspaceFetch(url, { method, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) }); } catch { return { ok: false, status: 0, body: { error: "unreachable", message: "The lab server did not answer. Is it running?" } }; }
  let body = null;
  try { body = await r.json(); } catch { /* not JSON */ }
  return { ok: r.ok, status: r.status, body: asBody(r, body) };
}

export const getInfo = () => call("GET", "/api/info");
export const getStory = (vertical) => call("GET", `/api/story${vertical ? `?vertical=${encodeURIComponent(vertical)}` : ""}`);
export const getDiagram = (name, vertical) => call("GET", `/api/diagram?name=${encodeURIComponent(name)}${vertical ? `&vertical=${encodeURIComponent(vertical)}` : ""}`);
export const getKey = () => call("GET", "/api/key");
export const putKey = (config) => call("PUT", "/api/key", config);
export const getUsage = () => call("GET", "/api/usage");
export const getScenarios = () => call("GET", "/api/scenarios");
export const postRun = (prompt, guardBlocked) => call("POST", "/api/run", { prompt, guardBlocked: guardBlocked === true });
export const postScenario = (id) => call("POST", `/api/scenario/${encodeURIComponent(id)}`, {});
export const postAdvance = (ms) => call("POST", "/api/clock/advance", { ms });
export const putStore = (store, available) => call("PUT", "/api/store", { store, available });
export const putProvider = (state) => call("PUT", "/api/provider", { state });
export const postSimilarity = (a, b, embeddingModel) => call("POST", "/api/similarity", { a, b, embeddingModel });
export const getObservability = () => call("GET", "/api/run-observability");
export const postReset = async () => { const r = await call("POST", "/api/reset", {}); if (r.ok) expectFreshWorkspace(); return r; }; // the next call rebuilds this tab's workspace on purpose
// Rule 19: the server-side Mock/Real toggle: exactly { source }. A 409 (Real not available) comes back as data with the reason.
export const setMode = (source) => call("POST", "/api/mode", { source });
