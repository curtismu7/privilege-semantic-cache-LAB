// Workspaces (rule 13). A workspace id (default "default", header X-Workspace) scopes the saved state: the key's chain and ledgers, the lab clock,
// the last run (for the what-this-run-left-behind panel) and the run log. Reset clears one workspace and gives its slot back.
// The number of workspaces is capped (the default workspace is exempt): at the cap the least recently used other workspace is forgotten to admit a new
// tab, never a refusal (a lab left running for days must not lock a new tab out). Shared by every workspace on purpose: the netguard counters and the mode.
export const DEFAULT_WORKSPACE = 'default';
export const MAX_WORKSPACES = 20;
export const WORKSPACE_HEADER = 'x-workspace';
const ID = /^[a-z0-9][a-z0-9-]{0,31}$/;

export const validWorkspace = (id) => typeof id === 'string' && ID.test(id);

export class WorkspaceError extends Error {
  constructor(code, status, message) { super(message); this.code = code; this.status = status; }
}

// The workspace id from a request: absent = default; a malformed one is an error, never silently the default.
export function workspaceFrom(req) {
  const raw = req.headers[WORKSPACE_HEADER];
  if (raw === undefined) return DEFAULT_WORKSPACE;
  if (!validWorkspace(raw)) throw new WorkspaceError('bad_workspace', 400, 'X-Workspace must be 1 to 32 lowercase letters, digits and dashes, starting with a letter or digit');
  return raw;
}

// build(id) makes one workspace's state. State is created on first use.
export function createWorkspaces({ build, max = MAX_WORKSPACES }) {
  const all = new Map();
  return {
    get(id = DEFAULT_WORKSPACE) {
      if (!validWorkspace(id)) throw new WorkspaceError('bad_workspace', 400, 'bad workspace id');
      let ws = all.get(id);
      if (ws) { all.delete(id); all.set(id, ws); return ws; } // insertion order = recency
      const others = [...all.keys()].filter((k) => k !== DEFAULT_WORKSPACE);
      if (id !== DEFAULT_WORKSPACE && others.length >= max) all.delete(others[0]);
      ws = build(id);
      all.set(id, ws);
      return ws;
    },
    peek: (id = DEFAULT_WORKSPACE) => all.get(id) ?? null,
    ids: () => [...all.keys()],
    // Reset forgets the workspace; it starts fresh on its next use and its slot is free again.
    reset(id) {
      if (!validWorkspace(id)) throw new WorkspaceError('bad_workspace', 400, 'bad workspace id');
      all.delete(id);
    },
  };
}
