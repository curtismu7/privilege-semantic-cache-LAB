import { Chip } from "../components/Bits.jsx";
import { visible } from "../safeText";

// The key's cache settings: the embedding model, the vector store, the match strictness (0 to 1) and the TTL (lab-clock milliseconds).
// The page points out the obvious mistakes next to the field, but Save still sends them: the server has the last word and its message is shown as it worded it.
export function configProblems(draft, bounds) {
  const p = {};
  const s = draft.strictness;
  if (typeof s !== "number" || Number.isNaN(s)) p.strictness = "Strictness is a number from 0 to 1.";
  else if (s < 0 || s > 1) p.strictness = "Strictness must be from 0 to 1.";
  const t = draft.ttlMs;
  if (typeof t !== "number" || Number.isNaN(t)) p.ttlMs = "TTL is a whole number of milliseconds.";
  else if (!Number.isInteger(t) || t < bounds.minTtlMs) p.ttlMs = `TTL is a whole number of milliseconds, at least ${bounds.minTtlMs} (zero and negative are refused).`;
  else if (t > bounds.maxTtlMs) p.ttlMs = `TTL is at most ${bounds.maxTtlMs} ms (one week of lab time).`;
  return p;
}
const blank = (draft) => Object.values(draft).some((v) => typeof v === "number" && Number.isNaN(v));

export default function KeyForm({ draft, setDraft, saved, bounds, models, stores, onSave, saving, saveError, dirty }) {
  const problems = configProblems(draft, bounds);
  const set = (patch) => setDraft({ ...draft, ...patch });
  const num = (v) => (v === "" ? NaN : Number(v));
  return (
    <section className="card" data-testid="key-form" aria-label="The key's cache settings">
      <p className="kicker">The key</p>
      <h2 className="card__title">Cache settings</h2>
      <p className="muted">Each key names its own embedding model and vector store, a match strictness and a TTL (release notes). The key holds no credential in this lab. The encoder is a stand-in, not a real embedding model.</p>
      <div className="keyform">
        <label>Embedding model (a lab stand-in)
          <select value={draft.embeddingModel} onChange={(e) => set({ embeddingModel: e.target.value })} data-testid="key-model">
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label>Vector store (a lab stand-in for Redis)
          <select value={draft.vectorRedis} onChange={(e) => set({ vectorRedis: e.target.value })} data-testid="key-store">
            {stores.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label>Strictness (0 to 1): a score at or above it is a hit
          <span className="strict">
            <input type="range" min="0" max="1" step="0.01" value={Number.isNaN(draft.strictness) ? 0 : Math.min(1, Math.max(0, draft.strictness))} onChange={(e) => set({ strictness: Number(e.target.value) })} data-testid="key-strictness-range" aria-label="Strictness slider" />
            <input type="number" min="0" max="1" step="0.01" inputMode="decimal" value={Number.isNaN(draft.strictness) ? "" : draft.strictness} onChange={(e) => set({ strictness: num(e.target.value) })} data-testid="key-strictness" aria-label="Strictness" aria-invalid={problems.strictness ? true : undefined} />
          </span>
        </label>
        {problems.strictness && <p className="field-error" role="alert" data-testid="key-strictness-error">{problems.strictness}</p>}
        <label>TTL (milliseconds of lab time)
          <input type="number" min={bounds.minTtlMs} step="1" inputMode="numeric" value={Number.isNaN(draft.ttlMs) ? "" : draft.ttlMs} onChange={(e) => set({ ttlMs: num(e.target.value) })} data-testid="key-ttl" aria-invalid={problems.ttlMs ? true : undefined} />
        </label>
        {problems.ttlMs && <p className="field-error" role="alert" data-testid="key-ttl-error">{problems.ttlMs}</p>}
      </div>
      <div className="seg">
        <button type="button" className="primary" onClick={onSave} disabled={saving || blank(draft)} data-testid="key-save">Save the key (the cache is kept)</button>
        {dirty ? <Chip state="warn" testId="key-dirty">unsaved changes</Chip> : <Chip state="ok" testId="key-saved">saved</Chip>}
        <span className="muted">Saved: {visible(`${saved.embeddingModel}, ${saved.vectorRedis}, strictness ${saved.strictness}, TTL ${saved.ttlMs} ms`)}</span>
      </div>
      {saveError && <p className="field-error" role="alert" data-testid="key-save-error">The server refused this key: {visible(saveError)}</p>}
    </section>
  );
}
