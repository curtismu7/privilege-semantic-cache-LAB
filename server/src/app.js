// The Express API (everything under /api/) and the built web page (web/dist), when there is one.
// One in-memory lab state per WORKSPACE (rule 13, header X-Workspace, default "default"): a session (lab clock, vector store stand-ins,
// the mock provider, one key), a run log and the last run (for the what-this-run-left-behind panel). Reset clears one workspace only.
// Mock only: Real answers 409 with a plain reason (rule 19).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { BANNER, LAB_MODEL, OPEN_QUESTIONS, SOURCED, UNVERIFIED } from './banner.js';
import { BOUNDS } from './bounds.js';
import { DEFAULT_CONFIG, SAVED_UNIT, STORE_IDS, validateConfig, validatePrompt } from './cache.js';
import { runChecks as defaultChecks } from './checks.js';
import { castForVertical, loadCustomerConfig, publicConfig } from './customer.js';
import { DIAGRAM_NAMES, buildDiagram, hasDiagram } from './diagramData.js';
import { allPassed } from './doctor.js';
import { ENCODER_LABEL, EMBEDDING_MODEL_IDS, cacheScore, embed, isEmbeddingModel } from './encoder.js';
import { LabError, invalidPrompt, invalidRequest } from './errors.js';
import { createHealth } from './health.js';
import { runPrompt, usageView } from './path.js';
import { MAX_RUNS, STREAMS, buildRunRecord, decisionLine, eventsFor, scenarioRuns, spanMs } from './runObs.js';
import { RunObsError } from './runObservability.js';
import { exchangesFor } from './runTrace.js';
import { jsonWritesOnly, makeHostCheck, sameOriginWrites } from './safety.js';
import { SCENARIOS, describeScenarios, findScenario, runScenario } from './scenarios.js';
import { PROVIDER_STATES, createSession, validateAdvance, validateProviderState, validateStore } from './session.js';
import { createRunLog } from './state.js';
import { buildStories } from './stories.js';
import { buildTalkTrack } from './talkTrack.js';
import { WorkspaceError, createWorkspaces, workspaceFrom } from './workspaces.js';

const { version } = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8'));
const NOT_REAL = 'Real mode is not built yet. It needs a tenant running the 2026-11-21 release and an owner-run, read-only read; until then this lab is Mock only.';
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
function onlyFields(body, allowed, what) {
  if (!isPlainObject(body)) throw invalidRequest(`${what} must be a JSON object`);
  for (const k of Object.keys(body)) if (!allowed.includes(k)) throw invalidRequest(`${what}: unknown field "${k.slice(0, 40)}"`);
  return body;
}

// One workspace's state. `lastRun` is the run the observability panel shows (a live run or a scenario run).
function createLabState() {
  let seq = 0;
  return { session: createSession(), runLog: createRunLog(), lastRun: null, nextRunId: () => `run-${++seq}` };
}

const sayLine = (line) => process.stdout.write(`${line}\n`);

export function createApp({
  env = process.env, runChecks = () => defaultChecks(env), customer = loadCustomerConfig({ env }), log = sayLine, now = Date.now, distDir = DIST,
  health = createHealth({ demoId: 'privilege-semantic-cache-lab', demoName: 'Privilege Semantic Cache LAB', version, runChecks, allPassed, mockOnly: () => true }),
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(makeHostCheck(env));
  app.use(sameOriginWrites);
  app.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff'); res.set('Cache-Control', 'no-store');
    res.set('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'");
    next();
  });
  app.use(jsonWritesOnly);
  // POST /api/similarity takes two prompts, so its body may be twice as large; it is parsed first, with its own limit.
  app.use('/api/similarity', express.json({ limit: BOUNDS.maxSimilarityBodyBytes, strict: true }));
  app.use(express.json({ limit: BOUNDS.maxBodyBytes, strict: true }));

  const workspaces = createWorkspaces({ build: () => createLabState() });
  // The workspace of a request: a bad X-Workspace is a 400 with a message, never silently the default.
  // A workspace this call had to build is announced with X-Workspace-Fresh: 1, so a tab that already used its id can tell that the server forgot it
  // (the 20-workspace cap, a restart) and say so instead of silently showing defaults.
  const wsOf = (req, res) => {
    const { ws, created } = workspaces.acquire(workspaceFrom(req));
    if (created) res.set('X-Workspace-Fresh', '1');
    return ws;
  };

  app.use('/api/health', health.router);

  // Every run, live or scenario, leaves the same things behind: one stdout line per decision, the last-run record for the panel and a trace.
  // runs: [{ prompt, out }]; originMs: the lab-clock time that maps to the start of the run.
  function recordRun(ws, { kind, scenarioId = null, runs, originMs }) {
    const runId = ws.nextRunId();
    const baseMs = now();
    const events = eventsFor(runs, { baseMs, originMs });
    for (const e of events) log(decisionLine(e, runId));
    ws.lastRun = { id: runId, startedAt: new Date(baseMs).toISOString(), endedAt: new Date(baseMs + spanMs(events, baseMs)).toISOString(), events, kind, scenarioId };
    return { runId, trace: { exchanges: exchangesFor(runs) } };
  }

  app.get('/api/info', (req, res) => {
    const ws = wsOf(req, res);
    res.json({
      app: 'privilege-semantic-cache-lab', version, tier: 'Demo',
      source: 'mock', mode: 'mock', realAvailable: false, realReason: NOT_REAL,
      banner: BANNER, unverified: UNVERIFIED, sourced: SOURCED, labModel: LAB_MODEL, openQuestions: OPEN_QUESTIONS,
      encoder: { label: ENCODER_LABEL, embeddingModels: EMBEDDING_MODEL_IDS, vectorStores: STORE_IDS },
      savedUnit: SAVED_UNIT, bounds: BOUNDS, scenarios: SCENARIOS.map((s) => s.id), runsSinceReset: ws.runLog.count(),
      workspace: workspaceFrom(req), name: customer.config.name,
    });
  });

  app.post('/api/mode', (req, res) => {
    const body = req.body;
    const keys = isPlainObject(body) ? Object.keys(body) : [];
    if (keys.length !== 1 || keys[0] !== 'source' || typeof body.source !== 'string') {
      return res.status(400).json({ error: 'bad_request', message: 'send exactly { "source": "mock" } or { "source": "real" }' });
    }
    if (body.source === 'mock') return res.json({ source: 'mock', realAvailable: false });
    if (body.source === 'real' || body.source === 'live') return res.status(409).json({ error: 'real_not_available', message: NOT_REAL });
    return res.status(400).json({ error: 'bad_request', message: 'source must be "mock" or "real"' });
  });

  app.get('/api/scenarios', (_req, res) => res.json({ banner: BANNER, scenarios: describeScenarios() }));

  // A scenario runs on its own lab, never on the workspace's key. Its runs leave the same traces and records as a live run.
  // (Every route checks its input BEFORE it touches a workspace: a request that is going to be refused creates nothing and evicts nothing.)
  app.post('/api/scenario/:id', (req, res) => {
    const sc = findScenario(req.params.id);
    if (!sc) return res.status(404).json({ error: 'unknown_scenario', message: 'no such scenario' });
    const ws = wsOf(req, res);
    const out = runScenario(sc.id);
    const runs = scenarioRuns(sc, out);
    ws.runLog.add({ kind: 'scenario', id: out.id, ok: out.ok });
    res.json({ ...out, ...recordRun(ws, { kind: 'scenario', scenarioId: sc.id, runs, originMs: 0 }) });
  });

  const keyView = (ws) => {
    const s = ws.session;
    return {
      key: s.key().id, config: s.key().getConfig(), entries: s.key().entryCount(), clockMs: s.lab.clock.now(),
      stores: s.stores(), providerState: s.providerState(), providerStates: PROVIDER_STATES, bounds: BOUNDS,
    };
  };

  app.get('/api/key', (req, res) => res.json(keyView(wsOf(req, res))));

  app.put('/api/key', (req, res) => {
    const patch = onlyFields(req.body, ['embeddingModel', 'vectorRedis', 'strictness', 'ttlMs'], 'key config');
    validateConfig(patch, DEFAULT_CONFIG); // every field is checked on its own, so the default config is enough to refuse a bad patch
    const ws = wsOf(req, res);
    const config = ws.session.key().setConfig(patch);
    res.json({ ...keyView(ws), config });
  });

  // The two controls the web page adds to the engine's own: a vector store outage, and the mock provider's state (what the next miss meets).
  app.put('/api/store', (req, res) => {
    const b = onlyFields(req.body, ['store', 'available'], 'store');
    validateStore(b.store, b.available);
    const ws = wsOf(req, res);
    ws.session.setStore(b.store, b.available);
    res.json(keyView(ws));
  });

  app.put('/api/provider', (req, res) => {
    const b = onlyFields(req.body, ['state'], 'provider');
    validateProviderState(b.state);
    const ws = wsOf(req, res);
    ws.session.setProviderState(b.state);
    res.json(keyView(ws));
  });

  // A pair's score, read only: no lookup, no store, no Usage, no clock. It lets the page show the same pair against any strictness.
  app.post('/api/similarity', (req, res) => {
    const b = onlyFields(req.body, ['a', 'b', 'embeddingModel'], 'similarity');
    validatePrompt(b.a); validatePrompt(b.b);
    if (b.embeddingModel !== undefined && !isEmbeddingModel(b.embeddingModel)) throw invalidRequest(`embeddingModel must be one of ${EMBEDDING_MODEL_IDS.join(', ')}`);
    if (!embed(DEFAULT_CONFIG.embeddingModel, b.a) || !embed(DEFAULT_CONFIG.embeddingModel, b.b)) throw invalidPrompt('a prompt has no letters or digits to encode');
    const model = b.embeddingModel === undefined ? wsOf(req, res).session.key().getConfig().embeddingModel : b.embeddingModel;
    const va = embed(model, b.a); const vb = embed(model, b.b);
    if (!va || !vb) throw invalidPrompt('a prompt has no letters or digits to encode');
    res.json({ embeddingModel: model, similarity: cacheScore(va, vb), encoder: ENCODER_LABEL });
  });

  app.post('/api/run', (req, res) => {
    const b = onlyFields(req.body, ['prompt', 'guardBlocked'], 'run');
    if (b.guardBlocked !== undefined && typeof b.guardBlocked !== 'boolean') throw invalidRequest('guardBlocked must be true or false');
    validatePrompt(b.prompt);
    if (b.guardBlocked !== true && !embed(DEFAULT_CONFIG.embeddingModel, b.prompt)) throw invalidPrompt('prompt has no letters or digits to encode'); // (a blocked prompt is never encoded)
    const ws = wsOf(req, res);
    const s = ws.session;
    const out = runPrompt(s.lab, s.key().id, { prompt: b.prompt, guardBlocked: b.guardBlocked === true });
    ws.runLog.add({ kind: 'run', outcome: out.outcome });
    res.json({ ...out, ...recordRun(ws, { kind: 'live', runs: [{ prompt: b.prompt, out }], originMs: out.trace[0].atMs }) });
  });

  app.post('/api/clock/advance', (req, res) => {
    const b = onlyFields(req.body, ['ms'], 'advance');
    validateAdvance(b.ms);
    res.json({ clockMs: wsOf(req, res).session.advance(b.ms) });
  });

  app.get('/api/usage', (req, res) => {
    const s = wsOf(req, res).session;
    res.json({ ...usageView(s.key()), clockMs: s.lab.clock.now() });
  });

  // The vertical packs and customer.config (rules 10 and 12): stories and the talk track with the cast filled in. ?vertical= picks a pack.
  app.get('/api/story', (req, res) => {
    const pick = castForVertical(customer, req.query.vertical);
    if (!pick) return res.status(400).json({ error: 'unknown_vertical', message: 'no such vertical' });
    res.json({ ...publicConfig(customer), vertical: pick.vertical, cast: pick.cast, stories: buildStories(pick.cast), talkTrack: buildTalkTrack(pick.cast), banner: BANNER, unverified: UNVERIFIED });
  });

  // Rule 17: the diagram by name, from diagram-studio data.
  app.get('/api/diagram', (req, res) => {
    const name = req.query.name === undefined ? DIAGRAM_NAMES[0] : req.query.name;
    if (!hasDiagram(name)) return res.status(404).json({ error: 'unknown_diagram', message: `no diagram with that name; the lab has: ${DIAGRAM_NAMES.join(', ')}` });
    const pick = castForVertical(customer, req.query.vertical);
    if (!pick) return res.status(400).json({ error: 'unknown_vertical', message: 'no such vertical' });
    res.json(buildDiagram(pick.cast, name));
  });

  // Rule 27: what the last run of this workspace left behind. null before any run.
  app.get('/api/run-observability', async (req, res, next) => {
    try {
      const ws = wsOf(req, res);
      res.json({ record: await buildRunRecord(ws.lastRun, { clock: now }), run: ws.lastRun ? { id: ws.lastRun.id, kind: ws.lastRun.kind, scenarioId: ws.lastRun.scenarioId } : null, streams: STREAMS, maxRuns: MAX_RUNS });
    } catch (e) { next(e); }
  });

  // Reset clears this workspace only (its session, run log and last run) and gives its slot back.
  app.post('/api/reset', (req, res) => {
    const id = workspaceFrom(req);
    const cleared = workspaces.peek(id)?.runLog.reset() ?? 0;
    workspaces.reset(id);
    res.json({ reset: 'ok', cleared, workspace: id });
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found', message: 'no such endpoint' }));

  // The built web page (web/dist), when there is one: tests and the doctor run without it. Any other GET gets index.html (hash routing needs only /).
  const indexHtml = path.join(distDir, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(distDir, { index: false, fallthrough: true }));
    app.get(/^\/(?!api(\/|$)|assets\/).*/, (_req, res) => res.sendFile(indexHtml)); // a missing /assets file is a 404, never the page (an HTML body parsed as a script is a silent blank page)
  }
  app.use((_req, res) => res.status(404).json({ error: 'not_found', message: 'Not found. The web page is not built here (npm run build); the API is under /api.' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof LabError) return res.status(err.status).json({ error: err.code, message: err.message });
    if (err instanceof WorkspaceError) return res.status(err.status).json({ error: err.code, message: err.message });
    if (err instanceof RunObsError) return res.status(err.status || 400).json({ error: err.code, message: err.message });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json', message: 'the body is not valid JSON' });
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'too_large', message: `the body is over ${Number.isInteger(err.limit) ? err.limit : BOUNDS.maxBodyBytes} bytes` });
    if (err?.type === 'charset.unsupported' || err?.type === 'encoding.unsupported') return res.status(415).json({ error: 'unsupported_encoding', message: 'send the body as utf-8 JSON' });
    // Express's own client errors (a malformed percent-escape in a path, for example) carry a 4xx status: honour it with a generic message.
    const status = Number(err?.status ?? err?.statusCode);
    if (Number.isInteger(status) && status >= 400 && status < 500) return res.status(status).json({ error: 'bad_request', message: 'the request could not be read' });
    // A real 500 is logged (the error's name and a short, line-free message; never the request) so it is not silent.
    process.stderr.write(`${new Date().toISOString()} privilege-semantic-cache-lab internal_error ${String(err?.name).slice(0, 40)}: ${String(err?.message).replace(/[\r\n]+/g, ' ').slice(0, 160)}\n`);
    return res.status(500).json({ error: 'internal_error', message: 'something went wrong in the lab' });
  });

  app.locals.health = health;
  return app;
}

export function startHttpServer({ port, host, app }) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      const a = server.address();
      resolve({ server, url: `http://${a.family === 'IPv6' ? `[${a.address}]` : a.address}:${a.port}/` });
    });
    server.once('error', reject);
  });
}

export { DEFAULT_PORT } from './safety.js';
