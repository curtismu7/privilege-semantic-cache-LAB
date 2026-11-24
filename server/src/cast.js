// {{token}} templating for the story data (rule 10). Stories and the talk track are written once with {{castBrand}}-style
// tokens; each of three vertical packs (data/verticals/*.json) defines every token, and customer.config.json may override
// the person-facing ones. A test fails on any token that a story uses and a pack does not define.
import fs from 'node:fs';

const TOKEN = /\{\{\s*(\w+)\s*\}\}/g;
// (HERE is a variable on purpose: Vite rewrites a literal `new URL('./x', import.meta.url)` into an asset URL, which would break the web tests that load this module.)
const HERE = import.meta.url;
const DIR = new URL('./data/verticals/', HERE);

export const DEFAULT_VERTICAL = 'retail';

export function loadVerticals(dir = DIR) {
  const out = {};
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    const v = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'));
    out[v.id] = Object.freeze({ id: v.id, label: v.label, cast: Object.freeze({ ...v.cast }) });
  }
  return Object.freeze(out);
}
export const VERTICALS = loadVerticals();
export const CAST_KEYS = Object.freeze(Object.keys(VERTICALS[DEFAULT_VERTICAL].cast));

export const tokensIn = (value, found = new Set()) => {
  if (typeof value === 'string') for (const m of value.matchAll(TOKEN)) found.add(m[1]);
  else if (Array.isArray(value)) value.forEach((v) => tokensIn(v, found));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => tokensIn(v, found));
  return found;
};
export const unfilled = (value, cast) => [...tokensIn(value)].filter((k) => !Object.hasOwn(cast, k));
export const fill = (text, cast) => String(text).replace(TOKEN, (m, k) => (Object.hasOwn(cast, k) ? cast[k] : m));
export function fillDeep(value, cast) {
  if (typeof value === 'string') return fill(value, cast);
  if (Array.isArray(value)) return value.map((v) => fillDeep(v, cast));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fillDeep(v, cast)]));
  return value;
}

export const verticalFrom = (id) => (typeof id === 'string' && Object.hasOwn(VERTICALS, id) ? id : DEFAULT_VERTICAL);
export const castFor = (vertical, overrides = {}) => ({ ...VERTICALS[verticalFrom(vertical)].cast, ...overrides });
