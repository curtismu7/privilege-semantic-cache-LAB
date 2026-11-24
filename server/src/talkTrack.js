// The talk track (rule 3): docs/talk-track.md is the one source. This reads it into sections, so the page, the presenter mode and the
// tests all use the same words. A "## S0n: title" heading belongs to story S0n; any other heading is a general section.
import fs from 'node:fs';
import { fillDeep } from './cast.js';

// (HERE is a variable on purpose: Vite rewrites a literal `new URL('./x', import.meta.url)` into an asset URL, which would break the web tests that load this module.)
const HERE = import.meta.url;
export const TALK_TRACK_FILE = new URL('../../docs/talk-track.md', HERE);
const STORY_HEADING = /^(S\d{2}):\s*(.+)$/;
const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function parseTalkTrack(markdown) {
  const text = String(markdown).replace(/<!--[\s\S]*?-->/g, '');
  const sections = [];
  let current = null;
  for (const line of text.split('\n')) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      const story = STORY_HEADING.exec(h[1]);
      current = { id: story ? story[1] : slug(h[1]), title: story ? story[2] : h[1], paragraphs: [] };
      sections.push(current);
    } else if (current) {
      if (line.trim()) current.paragraphs.push(line.trim());
    }
  }
  return sections.map((s) => ({ ...s, say: s.paragraphs.join('\n\n') }));
}

export function loadTalkTrack(file = TALK_TRACK_FILE) {
  try { return parseTalkTrack(fs.readFileSync(file, 'utf8')); } catch { return []; }
}

export const buildTalkTrack = (cast, sections = loadTalkTrack()) => fillDeep(sections, cast);
