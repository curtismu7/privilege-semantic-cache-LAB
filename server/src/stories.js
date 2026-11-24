// Stories as data (rule 10): data/stories/S0n-*.json, each with {{cast}} tokens. A story names the scenario it teaches, and a test replays
// that scenario against the engine so a story can never claim an outcome the lab does not produce.
import fs from 'node:fs';
import { VERTICALS, fillDeep, tokensIn, unfilled } from './cast.js';

// (HERE is a variable on purpose: Vite rewrites a literal `new URL('./x', import.meta.url)` into an asset URL, which would break the web tests that load this module.)
const HERE = import.meta.url;
const DIR = new URL('./data/stories/', HERE);

export function loadStories(dir = DIR) {
  return fs.readdirSync(dir).filter((n) => /^S\d{2}-.+\.json$/.test(n)).sort()
    .map((n) => ({ ...JSON.parse(fs.readFileSync(new URL(n, dir), 'utf8')), file: n }));
}
export const STORIES = Object.freeze(loadStories());

// -> { stories, tokens: [names used], missing: ["S01 uses {{x}} which retail lacks"] }. Used by the doctor and the tests.
export function scanStories(stories = STORIES, verticals = VERTICALS, extra = {}) {
  const missing = [];
  const used = new Set();
  const units = [...stories.map((s) => ({ id: s.id, value: s })), ...Object.entries(extra).map(([id, value]) => ({ id, value }))];
  for (const u of units) {
    for (const t of tokensIn(u.value)) used.add(t);
    for (const v of Object.values(verticals)) for (const t of unfilled(u.value, v.cast)) missing.push(`${u.id} uses {{${t}}} which ${v.id} lacks`);
  }
  return { stories: stories.length, tokens: [...used].sort(), missing };
}

// The stories with the cast filled in. `file` is dropped (a server path is not for the browser).
export const buildStories = (cast, stories = STORIES) => stories.map(({ file, ...s }) => fillDeep(s, cast));
