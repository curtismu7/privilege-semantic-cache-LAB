import { useState } from "react";
import { Chip } from "../components/Bits.jsx";
import { visible } from "../safeText";

const ADVANCES = [["+1 s", 1000], ["+10 s", 10_000], ["+1 min", 60_000], ["+1 h", 3_600_000]];
const clock = (ms) => `${Number(ms).toLocaleString("en-US")} ms`;

// The lab's three controls besides the key: the lab clock (to show a TTL passing), a vector store outage and the mock model's state (what the next miss meets).
export default function Controls({ view, bounds, onAdvance, onStore, onProvider, busy, error }) {
  const [custom, setCustom] = useState(60_000);
  const bad = !Number.isFinite(custom) || custom < 0 || custom > bounds.maxAdvanceMs;
  return (
    <section className="card" data-testid="controls" aria-label="Lab controls">
      <p className="kicker">Lab controls</p>
      <h2 className="card__title">Clock, store outage and model state</h2>
      <p>Lab clock: <strong data-testid="clock">{clock(view.clockMs)}</strong> <span className="muted">(nothing waits; only this control moves it)</span></p>
      <div className="seg" role="group" aria-label="Advance the lab clock">
        {ADVANCES.map(([label, ms]) => <button key={ms} type="button" disabled={busy} onClick={() => onAdvance(ms)} data-testid={`advance-${ms}`}>{label}</button>)}
        <label className="inline">Advance by (ms)
          <input type="number" min="0" max={bounds.maxAdvanceMs} step="1" inputMode="numeric" value={Number.isNaN(custom) ? "" : custom} onChange={(e) => setCustom(e.target.value === "" ? NaN : Number(e.target.value))} data-testid="advance-custom" aria-invalid={bad || undefined} />
        </label>
        <button type="button" disabled={busy || Number.isNaN(custom)} onClick={() => onAdvance(custom)} data-testid="advance-go">Advance</button>
      </div>
      {bad && !Number.isNaN(custom) && <p className="field-error" role="alert" data-testid="advance-error-hint">Advance by 0 to {bounds.maxAdvanceMs} ms (one week of lab time); the server refuses anything else.</p>}
      <p className="muted">An answer stored by the key is gone when the clock reaches its stored time plus the key's TTL.</p>

      <h3 className="panel__sub">Vector stores (stand-ins for Redis)</h3>
      <ul className="stores" data-testid="stores">
        {view.stores.map((s) => (
          <li key={s.id} data-testid={`store-${s.id}`}>
            <code>{visible(s.id)}</code>{" "}
            <Chip state={s.available ? "ok" : "bad"} testId={`store-state-${s.id}`}>{s.available ? "up" : "down"}</Chip>{" "}
            <span className="muted">{s.entries} entr{s.entries === 1 ? "y" : "ies"}{s.id === view.config.vectorRedis ? ", used by this key" : ""}</span>{" "}
            <button type="button" disabled={busy} onClick={() => onStore(s.id, !s.available)} data-testid={`store-toggle-${s.id}`} aria-label={`${s.available ? "Switch off" : "Switch on"} ${s.id}`}>{s.available ? "Switch off" : "Switch on"}</button>
          </li>
        ))}
      </ul>
      <p className="muted">A run against a store that is down ends in the named error vector_store_unavailable. What the product does in an outage is UNVERIFIED.</p>

      <label>What the next miss meets (the mock model)
        <select value={view.providerState} onChange={(e) => onProvider(e.target.value)} disabled={busy} data-testid="provider-state">
          {view.providerStates.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
      <p className="muted">A hit never calls the model, so this matters only on a miss.</p>
      {error && <p className="field-error" role="alert" data-testid="controls-error">{visible(error)}</p>}
    </section>
  );
}
