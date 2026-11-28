// customer.config (rule 12): branding and vocabulary a customer-facing run can change without touching code.
// customer.config.json beside package.json (or the file named by CUSTOMER_CONFIG) is read once at start. It is optional and
// git-ignored: a real customer's name never goes in the repo. Every field is validated; a bad one falls back to its default and the
// reason is reported in `warnings`, never thrown.
//   { "name": "...", "tagline": "...", "vertical": "airlines|retail|health|finance",
//     "cast": { "brand", "app", "task", "keyName", "owner" } }
// `cast` is the vocabulary: it renames the people and things the stories and the talk track talk about ({{castBrand}} and so on).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERTICALS, DEFAULT_VERTICAL, castFor } from './cast.js';
const LAB_NAME = 'Privilege Semantic Cache LAB';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DEFAULT_CONFIG_PATH = path.join(ROOT, 'customer.config.json');
const MAX_FILE_BYTES = 8 * 1024;
const LIMITS = { name: 60, tagline: 120, cast: 60 };
const TOP_KEYS = new Set(['_readme', 'name', 'tagline', 'vertical', 'cast']);
// short key -> cast token. keyName is an identifier (lowercase letters, digits, dashes).
export const CAST_SHORT = Object.freeze({ brand: 'castBrand', app: 'castApp', task: 'castTask', keyName: 'castKey', owner: 'castOwner' });
const IDENTIFIER_KEYS = new Set(['keyName']);
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

export const DEFAULTS = Object.freeze({ name: LAB_NAME, tagline: 'An LLM key reuses an earlier answer for a similar prompt.', vertical: DEFAULT_VERTICAL });

const hasMarkup = (t) => /[<>]/.test(t) || /\{\{|\}\}/.test(t) || /:\/\/|@/.test(t);
// C0/C1 controls and Unicode format characters (bidi overrides, zero-width) can make shown text differ from what it says.
// eslint-disable-next-line no-control-regex
const hasControl = (t) => /[\u0000-\u001f\u007f-\u009f\p{Cf}]/u.test(t);
const safeKey = (k) => String(k).slice(0, 40).replace(/[^\w.-]/g, '?');

function plainText(value, max) {
  if (typeof value !== 'string') return { error: 'must be a string' };
  const text = value.trim();
  if (!text) return { error: 'must not be empty' };
  if (text.length > max) return { error: `is longer than ${max} characters` };
  if (hasMarkup(text) || hasControl(text)) return { error: 'must be plain text (no < > @ :// {{ }} or control characters)' };
  return { text };
}

export function validateConfig(input) {
  const warnings = [];
  const out = { ...DEFAULTS, castOverrides: {} };
  const warn = (field, why) => warnings.push(`${field}: ${why}; the default is used`);
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return { config: finish(out), warnings: ['config: must be a JSON object; the defaults are used'] };
  for (const key of Object.keys(input)) if (!TOP_KEYS.has(key)) warnings.push(`${safeKey(key)}: unknown key ignored`);
  for (const [field, max] of [['name', LIMITS.name], ['tagline', LIMITS.tagline]]) {
    if (!Object.hasOwn(input, field)) continue;
    const r = plainText(input[field], max);
    if (r.error) warn(field, r.error); else out[field] = r.text;
  }
  if (Object.hasOwn(input, 'vertical')) {
    if (typeof input.vertical === 'string' && Object.hasOwn(VERTICALS, input.vertical)) out.vertical = input.vertical;
    else warn('vertical', `must be one of ${Object.keys(VERTICALS).join(', ')}`);
  }
  if (Object.hasOwn(input, 'cast')) {
    const obj = input.cast;
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) warn('cast', 'must be an object');
    else {
      for (const [short, value] of Object.entries(obj)) {
        if (!Object.hasOwn(CAST_SHORT, short)) { warnings.push(`cast.${safeKey(short)}: unknown key ignored`); continue; }
        const r = plainText(value, LIMITS.cast);
        if (r.error) { warn(`cast.${short}`, r.error); continue; }
        if (IDENTIFIER_KEYS.has(short) && !ID.test(r.text.toLowerCase())) { warn(`cast.${short}`, 'must be lowercase letters, digits and dashes'); continue; }
        out.castOverrides[CAST_SHORT[short]] = IDENTIFIER_KEYS.has(short) ? r.text.toLowerCase() : r.text;
      }
    }
  }
  return { config: finish(out), warnings };
}
const finish = (c) => ({ name: c.name, tagline: c.tagline, vertical: c.vertical, cast: castFor(c.vertical, c.castOverrides) });

// A missing file is normal (defaults); an unreadable or oversize one is reported.
export function loadCustomerConfig({ file, env = process.env } = {}) {
  const target = file ?? (env.CUSTOMER_CONFIG ? path.resolve(env.CUSTOMER_CONFIG) : DEFAULT_CONFIG_PATH);
  let text;
  try {
    const stat = fs.statSync(target);
    if (stat.size > MAX_FILE_BYTES) return { ...validateConfig(null), warnings: [`config file is larger than ${MAX_FILE_BYTES} bytes; the defaults are used`] };
    text = fs.readFileSync(target, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT' && !env.CUSTOMER_CONFIG) return { config: validateConfig({}).config, warnings: [] };
    return { ...validateConfig(null), warnings: ['config file could not be read; the defaults are used'] };
  }
  let parsed;
  try { parsed = JSON.parse(text); } catch { return { ...validateConfig(null), warnings: ['config file is not valid JSON; the defaults are used'] }; }
  return validateConfig(parsed);
}

// What the browser may know: branding, the vertical and the filled cast. Nothing else.
export const publicConfig = ({ config, warnings }) => ({ name: config.name, tagline: config.tagline, vertical: config.vertical, verticals: Object.values(VERTICALS).map((v) => ({ id: v.id, label: v.label })), cast: config.cast, warnings });

// The vertical picker (rule 10): the page may ask for stories and the talk track in any of the packs. The configured vertical keeps the
// customer's own words (their brand and approver); another pack is shown as the pack, never with a customer's name on a different industry.
// -> { vertical, cast } or null for a vertical this lab does not have.
export function castForVertical({ config }, wanted) {
  if (wanted === undefined || wanted === '') return { vertical: config.vertical, cast: config.cast };
  if (typeof wanted !== 'string' || !Object.hasOwn(VERTICALS, wanted)) return null;
  return wanted === config.vertical ? { vertical: config.vertical, cast: config.cast } : { vertical: wanted, cast: castFor(wanted) };
}
