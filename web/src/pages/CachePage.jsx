import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getKey, getScenarios, getUsage, postAdvance, putKey, putProvider, putStore } from "../api";
import { Card, Loading } from "../components/Bits.jsx";
import KeyForm from "./KeyForm.jsx";
import Controls from "./Controls.jsx";
import SimilarityView from "./SimilarityView.jsx";
import OpenQuestions from "./OpenQuestions.jsx";
import Result from "./Result.jsx";
import { visible } from "../safeText";

const scenarioFromHash = () => { const parts = window.location.hash.replace("#", "").split("/"); return parts[0] === "cache" && parts[1] ? parts[1] : null; };
const sameConfig = (a, b) => ["embeddingModel", "vectorRedis", "strictness", "ttlMs"].every((k) => a[k] === b[k]);
const DEFAULT_PROMPT = "How do I reset my password?";

export default function CachePage({ lab }) {
  const [view, setView] = useState(null); // the saved key and the lab's state (GET /api/key)
  const [usage, setUsage] = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [draft, setDraft] = useState(null);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [guardBlocked, setGuardBlocked] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [runError, setRunError] = useState(null);
  const [scenarioError, setScenarioError] = useState(null);
  const [controlsError, setControlsError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const limits = lab.info.bounds;

  const adopt = useCallback((body, keepDraft) => { setView(body); if (!keepDraft) setDraft({ ...body.config }); }, []);
  const refreshUsage = useCallback(async () => { const u = await getUsage(); if (u.ok) setUsage(u.body); }, []);
  const refreshKey = useCallback(async () => { const k = await getKey(); if (k.ok) adopt(k.body, true); }, [adopt]);

  useEffect(() => {
    let live = true;
    Promise.all([getKey(), getScenarios(), getUsage()]).then(([k, s, u]) => {
      if (!live) return;
      if (!k.ok || !s.ok || !u.ok) { setLoadError((!k.ok ? k : !s.ok ? s : u).body?.message || "The key could not be loaded."); return; }
      adopt(k.body, false); setScenarios(s.body.scenarios); setUsage(u.body);
    });
    return () => { live = false; };
  }, [adopt]);

  // "#cache/<scenario>" (the Stories page's Show it, a shared link, the address bar) runs that scenario when it names one that is not already on screen:
  // once the page has loaded, and again whenever the address changes to another scenario. Reset, a mode switch and a vertical change clear the scenario
  // from the address (App.jsx), so a remount never re-runs it.
  const lastRef = useRef(lab.last);
  lastRef.current = lab.last;
  const runFromHash = () => {
    const id = scenarioFromHash();
    const shown = lastRef.current?.kind === "scenario" ? lastRef.current.id : null;
    if (id && id !== shown && !lab.busy && scenarios.some((s) => s.id === id)) runScenario(id);
  };
  const runFromHashRef = useRef(runFromHash);
  runFromHashRef.current = runFromHash;
  useEffect(() => { runFromHashRef.current(); }, [scenarios.length]);
  useEffect(() => { const on = () => runFromHashRef.current(); window.addEventListener("hashchange", on); return () => window.removeEventListener("hashchange", on); }, []);

  const runScenario = async (id) => {
    setScenarioError(null);
    try { window.history.replaceState(null, "", `#cache/${id}`); } catch { /* ignore */ }
    const r = await lab.runScenario(id);
    if (!r.ok) setScenarioError(r.message);
    else runFromHashRef.current(); // an address that changed while this run was in flight is honoured now that the page is free
  };
  const run = async () => {
    setRunError(null);
    try { window.history.replaceState(null, "", "#cache"); } catch { /* ignore */ }
    const r = await lab.runLive(prompt, guardBlocked);
    if (!r.ok) { setRunError(r.message); return; }
    if (!r.dropped) await Promise.all([refreshUsage(), refreshKey()]); // a dropped run changed nothing the usage and the key report
  };
  const save = async () => {
    setSaving(true); setSaveError(null);
    try {
      const { embeddingModel, vectorRedis, strictness, ttlMs } = draft;
      const r = await putKey({ embeddingModel, vectorRedis, strictness, ttlMs });
      if (!r.ok) { setSaveError(r.body?.message || `HTTP ${r.status}`); return; }
      adopt(r.body, false);
    } finally { setSaving(false); }
  };
  // The three lab controls. Each answers with the lab's state, so the page never guesses it.
  const control = async (fn) => {
    setControlsError(null);
    const r = await fn();
    if (!r.ok) { setControlsError(r.body?.message || `HTTP ${r.status}`); return; }
    await Promise.all([refreshKey(), refreshUsage()]);
  };
  const advance = (ms) => control(() => postAdvance(ms));
  const setStore = (id, on) => control(() => putStore(id, on));
  const setProvider = (state) => control(() => putProvider(state));

  const dirty = useMemo(() => !!view && !!draft && !sameConfig(draft, view.config), [draft, view]);
  const active = lab.last?.kind === "scenario" ? lab.last.id : null;
  const activeScenario = scenarios.find((s) => s.id === active);
  const moveStrictness = (v) => setDraft((d) => ({ ...d, strictness: v }));

  if (loadError) return <Card tone="warn" title="The key could not be loaded" testId="cache-load-error"><p role="alert">{visible(loadError)}</p></Card>;
  if (!view || !draft || !usage) return <Loading />;
  const promptTooLong = prompt.length > limits.maxPromptChars;
  const promptEmpty = !prompt.trim();

  return (
    <div className="stack">
      <section className="card" data-testid="scenarios" aria-label="Scenarios">
        <p className="kicker">Scenarios</p>
        <h2 className="card__title">Nine scripted runs, each with a hand-written expected result</h2>
        <div className="seg" role="group" aria-label="Scenarios">
          {scenarios.map((s) => <button key={s.id} type="button" aria-pressed={active === s.id} disabled={lab.busy} onClick={() => runScenario(s.id)} data-testid={`scenario-${s.id}`}>{s.title}</button>)}
        </div>
        {activeScenario ? <p data-testid="scenario-summary">{visible(activeScenario.story)}</p> : <p className="muted">A scenario runs on its own fresh lab and clock and never touches the key below.</p>}
        {scenarioError && <p className="field-error" role="alert" data-testid="scenario-error">{visible(scenarioError)}</p>}
      </section>

      <div className="cols cols--result">
        <div className="stack">
          <KeyForm draft={draft} setDraft={setDraft} saved={view.config} bounds={limits} models={lab.info.encoder.embeddingModels} stores={lab.info.encoder.vectorStores}
            onSave={save} saving={saving} saveError={saveError} dirty={dirty} />
          <section className="card" data-testid="prompt-card">
            <p className="kicker">Your run</p>
            <h2 className="card__title">Prompt</h2>
            <label>Prompt (up to {limits.maxPromptChars} characters)
              <textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} data-testid="prompt" aria-invalid={promptTooLong || promptEmpty || undefined} />
            </label>
            <p className="muted" data-testid="prompt-count">{prompt.length} of {limits.maxPromptChars} characters</p>
            {promptTooLong && <p className="field-error" role="alert" data-testid="prompt-error">The prompt is over {limits.maxPromptChars} characters; the server refuses it.</p>}
            <label className="check"><input type="checkbox" checked={guardBlocked} onChange={(e) => setGuardBlocked(e.target.checked)} data-testid="guard-blocked" /> The guard blocks this prompt (the lab runs the guard before the cache; the product's order is UNVERIFIED)</label>
            <div className="seg">
              <button type="button" className="primary" onClick={run} disabled={lab.busy || promptEmpty} data-testid="run">Run on this key</button>
              {dirty && <span className="muted" data-testid="run-hint">Unsaved settings: a run uses the saved key.</span>}
              {promptEmpty && <span className="muted">Type a prompt to run it.</span>}
            </div>
            {runError && <p className="field-error" role="alert" data-testid="run-error">{visible(runError.charAt(0).toUpperCase() + runError.slice(1))}</p>}
          </section>
          <SimilarityView embeddingModel={draft.embeddingModel} strictness={draft.strictness} setStrictness={moveStrictness} limits={limits} />
          <Controls view={view} bounds={limits} onAdvance={advance} onStore={setStore} onProvider={setProvider} busy={lab.busy} error={controlsError} />
        </div>
        <div className="stack">
          <Result last={lab.last} usage={usage} usageClock={view.clockMs} savedUnit={usage.savedUnit} scenarios={scenarios} obs={lab.obs} source={lab.source || "mock"} />
          <OpenQuestions items={lab.info.openQuestions} />
        </div>
      </div>
    </div>
  );
}
