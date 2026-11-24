// The Express API. Everything under /api/. No static files yet (the web UI is a later step).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { BANNER, OPEN_QUESTIONS, UNVERIFIED } from './banner.js';
import { BOUNDS } from './bounds.js';
import { SAVED_UNIT, STORE_IDS } from './cache.js';
import { runChecks as defaultChecks } from './checks.js';
import { allPassed } from './doctor.js';
import { ENCODER_LABEL, EMBEDDING_MODEL_IDS } from './encoder.js';
import { LabError, invalidRequest } from './errors.js';
import { createHealth } from './health.js';
import { runPrompt, usageView } from './path.js';
import { jsonWritesOnly, makeHostCheck, sameOriginWrites } from './safety.js';
import { SCENARIOS, describeScenarios, findScenario, runScenario } from './scenarios.js';
import { createSession } from './session.js';
import { createRunLog } from './state.js';

const { version } = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8'));
const NOT_REAL = 'Real mode is not built yet. It needs a tenant running the 2026-11-21 release and an owner-run, read-only read; until then this lab is Mock only.';

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
function onlyFields(body, allowed, what) {
  if (!isPlainObject(body)) throw invalidRequest(`${what} must be a JSON object`);
  for (const k of Object.keys(body)) if (!allowed.includes(k)) throw invalidRequest(`${what}: unknown field "${k.slice(0, 40)}"`);
  return body;
}

export function createApp({ env = process.env, runChecks = () => defaultChecks(env), runLog = createRunLog() } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(makeHostCheck(env));
  app.use(sameOriginWrites);
  app.use(jsonWritesOnly);
  app.use(express.json({ limit: BOUNDS.maxBodyBytes, strict: true }));

  let session = createSession();

  const health = createHealth({ demoId: 'privilege-semantic-cache-lab', demoName: 'Privilege Semantic Cache LAB', version, runChecks, allPassed, mockOnly: () => true });
  app.use('/api/health', health.router);

  app.get('/api/info', (_req, res) => {
    res.json({
      app: 'privilege-semantic-cache-lab', version, tier: 'Demo',
      source: 'mock', mode: 'mock', realAvailable: false, realReason: NOT_REAL,
      banner: BANNER, unverified: UNVERIFIED, openQuestions: OPEN_QUESTIONS,
      encoder: { label: ENCODER_LABEL, embeddingModels: EMBEDDING_MODEL_IDS, vectorStores: STORE_IDS },
      savedUnit: SAVED_UNIT, bounds: BOUNDS, scenarios: SCENARIOS.map((s) => s.id), runsSinceReset: runLog.count(),
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

  app.post('/api/scenario/:id', (req, res) => {
    if (!findScenario(req.params.id)) return res.status(404).json({ error: 'unknown_scenario', message: 'no such scenario' });
    const out = runScenario(req.params.id);
    runLog.add({ kind: 'scenario', id: out.id, ok: out.ok });
    res.json(out);
  });

  app.get('/api/key', (_req, res) => res.json({ key: session.key().id, config: session.key().getConfig(), entries: session.key().entryCount(), clockMs: session.lab.clock.now() }));

  app.put('/api/key', (req, res) => {
    const config = session.key().setConfig(onlyFields(req.body, ['embeddingModel', 'vectorRedis', 'strictness', 'ttlMs'], 'key config'));
    res.json({ key: session.key().id, config });
  });

  app.post('/api/run', (req, res) => {
    const b = onlyFields(req.body, ['prompt', 'guardBlocked'], 'run');
    if (b.guardBlocked !== undefined && typeof b.guardBlocked !== 'boolean') throw invalidRequest('guardBlocked must be true or false');
    const out = runPrompt(session.lab, session.key().id, { prompt: b.prompt, guardBlocked: b.guardBlocked === true });
    runLog.add({ kind: 'run', outcome: out.outcome });
    res.json(out);
  });

  app.post('/api/clock/advance', (req, res) => {
    const b = onlyFields(req.body, ['ms'], 'advance');
    res.json({ clockMs: session.advance(b.ms) });
  });

  app.get('/api/usage', (_req, res) => res.json({ ...usageView(session.key()), clockMs: session.lab.clock.now() }));

  app.post('/api/reset', (_req, res) => {
    session = createSession();
    res.json({ reset: 'ok', cleared: runLog.reset() });
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found', message: 'no such endpoint' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof LabError) return res.status(err.status).json({ error: err.code, message: err.message });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json', message: 'the body is not valid JSON' });
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'too_large', message: `the body is over ${BOUNDS.maxBodyBytes} bytes` });
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
