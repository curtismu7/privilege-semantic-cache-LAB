// The one live session behind the API: a lab clock, the vector store stand-ins and a single key. Reset builds a new one.
import { BOUNDS } from './bounds.js';
import { DEFAULT_CONFIG } from './cache.js';
import { invalidRequest } from './errors.js';
import { createLab } from './path.js';

export const SESSION_KEY_ID = 'lab-key';

export function createSession() {
  const lab = createLab();
  lab.addKey(SESSION_KEY_ID, DEFAULT_CONFIG);
  return {
    lab,
    key: () => lab.key(SESSION_KEY_ID),
    advance(ms) {
      if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0 || ms > BOUNDS.maxAdvanceMs) throw invalidRequest(`ms must be a number from 0 to ${BOUNDS.maxAdvanceMs}`);
      return lab.clock.advance(ms);
    },
  };
}
