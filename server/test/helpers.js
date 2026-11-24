import { createClock } from '../src/model-gateway-sim/labClock.js';
export const newClock = (t = 0) => createClock(t);
export const code = (fn) => { try { fn(); } catch (e) { return e.code ?? e.name; } return null; };
