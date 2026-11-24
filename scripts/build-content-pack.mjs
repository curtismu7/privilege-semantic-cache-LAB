// Builds content-pack.json for the Learning Hub from the story data, so the pack cannot drift from the lab.
//   node scripts/build-content-pack.mjs        (writes content-pack.json)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERTICALS, DEFAULT_VERTICAL, fillDeep } from '../server/src/cast.js';
import { STORIES } from '../server/src/stories.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

export function buildPack() {
  const cast = VERTICALS[DEFAULT_VERTICAL].cast;
  const stories = STORIES.map(({ file, ...s }) => ({ file, ...fillDeep(s, cast) }));
  const terms = {
    'exact-repeat-hits': ['semantic-cache'], 'paraphrase-hits-with-score': ['semantic-cache', 'stand-in-encoder'], 'unrelated-misses': ['semantic-cache', 'stand-in-encoder'], 'strictness-flips-the-pair': ['match-strictness', 'stand-in-encoder'],
    'ttl-expiry-misses': ['cache-ttl'], 'usage-matches-calls': ['cache-usage', 'unverified-model'], 'two-keys-never-share': ['semantic-cache', 'unverified-model'], 'guard-blocked-not-cached': ['unverified-model'], 'store-outage-named-error': ['unverified-model'],
  };
  return {
    schema: 'demo-content-pack/1',
    id: 'privilege-semantic-cache-lab',
    title: 'Privilege Semantic Cache LAB',
    version,
    demo: { id: 'privilege-semantic-cache-lab', name: 'Privilege Semantic Cache LAB', catalog: 'D000', baseUrl: 'http://localhost:7847', doctor: '/api/health', tags: ['llm', 'semantic-cache', 'usage', 'privilege', 'simulated', 'mock-only'] },
    glossary: [
      { id: 'semantic-cache', term: 'Semantic cache', definition: 'An LLM key can reuse an earlier answer for a semantically similar prompt, with its own embedding model and vector Redis (2026-11-21 release notes). The match, the order of the lookup and the guard, and the outage behaviour shown here are this lab\'s own model.', aliases: ['per-key cache', 'prompt cache'] },
      { id: 'match-strictness', term: 'Match strictness', definition: 'A per-key setting: how close a new prompt must be to an earlier one before its answer is reused (release notes). In the lab a score at or above the strictness, from 0 to 1, is a hit; the scale is the lab\'s own.', aliases: ['strictness', 'similarity threshold'] },
      { id: 'cache-ttl', term: 'Cache TTL', definition: 'A per-key setting: how long a stored answer is reused (release notes). In the lab, on the lab clock, an answer is live from the end of the model call until its stored time plus the TTL, and gone at exactly that time.', aliases: ['TTL'] },
      { id: 'cache-usage', term: 'Usage: Requests, From cache, Saved', definition: 'The Usage view counts Requests, From cache and Saved (release notes). How Saved is computed is not stated: the lab counts the stored answer\'s output tokens in lab-model tokens and labels the unit UNVERIFIED.', aliases: ['saved'] },
      { id: 'stand-in-encoder', term: 'Stand-in encoder', definition: 'The lab does not use a real embedding model. A deterministic stand-in hashes character n-grams and compares them with cosine similarity, so it measures shared words, not meaning. It exists so a run is repeatable.', aliases: ['not a real embedding model'] },
      { id: 'unverified-model', term: 'UNVERIFIED (lab model)', definition: 'Anything the release notes do not say is the lab\'s own model and is labelled UNVERIFIED: how Saved is computed, whether the cache is scoped by key only or also by user (an open question), whether the guard runs before or after the lookup, what the product does when the Redis is down.', aliases: ['lab model'] },
    ],
    sources: [],
    cards: [
      ...stories.map((s) => ({ id: `try-${s.scenario}`, label: `${s.id}: ${s.title}`, description: s.control, group: 'try-it', action: { type: 'route', href: `/#cache/${s.scenario}` }, terms: terms[s.scenario], story: s.id })),
      { id: 'concept-limits', label: 'What is sourced and what is the lab\'s model', description: 'The release-notes claims, the lab\'s own model, the list of what is UNVERIFIED and the open question on the cache scope.', group: 'concept', action: { type: 'route', href: '/#limits' }, terms: ['unverified-model'] },
      { id: 'ref-doctor', label: 'Doctor and health', description: 'Preflight checks and the demo-health/1 endpoint.', group: 'setup', action: { type: 'route', href: '/api/health' } },
    ],
    diagrams: [{ id: 'semantic-cache', label: 'Semantic cache: a similar prompt reuses an earlier answer', href: '/#diagram', mode: 'mock' }],
    stories: stories.map((s) => ({ id: s.id, title: s.title, say: s.control, file: `server/src/data/stories/${s.file}` })),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(path.join(ROOT, 'content-pack.json'), `${JSON.stringify(buildPack(), null, 2)}\n`);
}
