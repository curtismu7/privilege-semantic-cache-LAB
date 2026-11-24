// A short log of runs, so Reset has something to clear. Bounded.
import { BOUNDS } from './bounds.js';

export function createRunLog() {
  let runs = [];
  return {
    add(entry) { runs.push(entry); if (runs.length > BOUNDS.maxRunsKept) runs = runs.slice(-BOUNDS.maxRunsKept); },
    count: () => runs.length,
    list: () => runs.slice(),
    reset() { const n = runs.length; runs = []; return n; },
  };
}
