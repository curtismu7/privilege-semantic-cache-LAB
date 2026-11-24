// The one live session behind the API for ONE workspace: a lab clock, the vector store stand-ins, the mock provider and a single key.
// Reset throws the whole session away (the workspace map does that). The clock, a store outage and the provider's state are the only
// controls besides the key's own config, and each is bounded here.
import { BOUNDS } from './bounds.js';
import { DEFAULT_CONFIG, STORE_IDS } from './cache.js';
import { invalidRequest } from './errors.js';
import { PROVIDER_STATES } from './model-gateway-sim/providerStub.js';
import { createLab } from './path.js';

export const SESSION_KEY_ID = 'lab-key';
export { PROVIDER_STATES };

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
    // Switch one vector store stand-in off or on, to show the named outage error. Only the lab's own stores can be named.
    setStore(store, available) {
      if (typeof store !== 'string' || !STORE_IDS.includes(store)) throw invalidRequest(`store must be one of ${STORE_IDS.join(', ')}`);
      if (typeof available !== 'boolean') throw invalidRequest('available must be true or false');
      lab.stores.setAvailable(store, available);
      return this.stores();
    },
    stores: () => STORE_IDS.map((id) => ({ id, available: lab.stores.isAvailable(id), entries: lab.stores.size(id) })),
    setProviderState(state) {
      if (typeof state !== 'string' || !PROVIDER_STATES.includes(state)) throw invalidRequest(`state must be one of ${PROVIDER_STATES.join(', ')}`);
      lab.provider.setState(state);
      return lab.provider.getState();
    },
    providerState: () => lab.provider.getState(),
  };
}
