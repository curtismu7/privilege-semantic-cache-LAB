import { useEffect, useRef } from "react";
import { visible } from "../safeText";
import { Card, Chip, HOT, Json } from "../components/Bits.jsx";
import ScoreBar, { fmtScore } from "../components/ScoreBar.jsx";
import GatewayTrace from "../gateway-trace/GatewayTrace.jsx";
import RunObservability from "../run-observability/RunObservability.jsx";

// The engine's plain messages start in lower case ("the vector store ..."): a sentence on the page starts with a capital and ends with a full stop.
const sentence = (t) => { const x = String(t ?? "").trim().replace(/[.\s]+$/, ""); return x ? `${x[0].toUpperCase()}${x.slice(1)}.` : ""; };
const ms = (n) => `${Number(n).toLocaleString("en-US")} ms`;
const OUTCOME = { hit: ["ok", "HIT"], miss: ["info", "MISS"], blocked: ["warn", "BLOCKED"], error: ["bad", "ERROR"] };
const BASIS = "Simulated: the lab's own mock gateway computed every decision, so each is marked checked. The hosts are .example names and the credentials shown are lab mocks, never real ones. How the real product words its response is UNVERIFIED.";
const OBS_NOTE = "In this lab: Agent is the calling app, Privilege is the lab's model of the LLM gateway (its guard and cache decisions), Resource server is the mock model. Person, Authorize and Agent gateway have nothing to log here and the panel says so. Times are when the lab computed them.";

export const OutcomeChip = ({ outcome, testId }) => { const [state, word] = OUTCOME[outcome] || ["none", String(outcome).toUpperCase()]; return <Chip state={state} testId={testId}>{word}</Chip>; };

// Requests, From cache and Saved: the Usage view (release notes). The unit of Saved is the lab's own and says so.
export function Usage({ usage, clockMs, scope, savedUnit }) {
  return (
    <section className="card" data-testid="usage" aria-label="Usage">
      <p className="kicker">{scope || "Usage of the live key"}</p>
      <h2 className="card__title">Usage</h2>
      <div className="card-grid card-grid--stats">
        <div className="stat"><span className="muted">Requests</span><span className="stat__n" data-testid="usage-requests">{usage.requests}</span></div>
        <div className="stat"><span className="muted">From cache</span><span className="stat__n" data-testid="usage-from-cache">{usage.fromCache}</span></div>
        <div className="stat"><span className="muted">Saved</span><span className="stat__n" data-testid="usage-saved">{usage.saved}</span></div>
      </div>
      <p className="muted" data-testid="usage-unit">Saved is counted in {visible(savedUnit || usage.savedUnit)}.{clockMs !== undefined ? ` Lab clock: ${ms(clockMs)}.` : ""}</p>
    </section>
  );
}

// The verdict first: HIT with its score and the entry it matched, or MISS, or the guard's stop, or the named error.
export function Verdict({ out, prompt }) {
  const strictness = out.config.strictness;
  return (
    <Card tone={out.outcome === "hit" ? "ok" : out.outcome === "error" ? "danger" : out.outcome === "blocked" ? "warn" : undefined} kicker="Your run on the live key" testId="verdict">
      <h2 className="card__title" data-testid="verdict-title">
        <OutcomeChip outcome={out.outcome} testId="verdict-chip" />{" "}
        {out.outcome === "hit" && <>score <span data-testid="verdict-score">{fmtScore(out.similarity)}</span> at strictness {strictness}</>}
        {out.outcome === "miss" && <>{out.similarity === null ? "nothing close in the cache" : <>nearest score <span data-testid="verdict-score">{fmtScore(out.similarity)}</span> is below strictness {strictness}</>}</>}
        {out.outcome === "blocked" && "stopped by the guard before the cache"}
        {out.outcome === "error" && <code data-testid="error-code">{visible(out.error.code)}</code>}
      </h2>
      {out.outcome === "hit" && (
        <>
          <p data-testid="verdict-line">Answered from the cache: the model was not called.</p>
          <dl className="kv">
            <dt>Matched entry</dt><dd data-testid="matched-prompt">{visible(out.matched.prompt)}</dd>
            <dt>Stored at, expires at</dt><dd>{ms(out.matched.storedAt)} and {ms(out.matched.expiresAt)} (lab clock; a hit does not extend it)</dd>
            <dt>Saved by this hit</dt><dd>{out.matched.outputTokens} lab-model tokens (the unit is UNVERIFIED)</dd>
            <dt>Answer (stored)</dt><dd><code data-testid="answer">{visible(out.answer)}</code></dd>
          </dl>
        </>
      )}
      {out.outcome === "miss" && (
        <>
          <p data-testid="verdict-line">The model answered and the answer was stored for later, until lab time {ms(out.expiresAt)}.</p>
          <dl className="kv">
            <dt>Nearest entry</dt><dd data-testid="nearest-prompt">{out.nearest ? visible(out.nearest.prompt) : "none: no live entry of this key and embedding model"}</dd>
            <dt>Answer (lab mock)</dt><dd><code data-testid="answer">{visible(out.answer)}</code></dd>
          </dl>
        </>
      )}
      {out.outcome === "blocked" && <p data-testid="verdict-line">{visible(sentence(out.error.message))} Nothing was looked up, sent, stored or counted.</p>}
      {out.outcome === "error" && (
        <>
          <p data-testid="verdict-line">{visible(sentence(`${out.error.message}${out.error.status ? ` (HTTP ${out.error.status} in the API)` : ""}`))}</p>
          <p className="muted">{visible(sentence(out.error.note || "No answer was stored"))} The wording and status are this lab's own and UNVERIFIED.</p>
        </>
      )}
      {(out.outcome === "hit" || out.outcome === "miss") && <ScoreBar score={out.similarity} strictness={strictness} testId="run-bar" />}
      <p className="muted" data-testid="verdict-prompt-note">Prompt: {prompt.length} characters, key {visible(out.key)}, {visible(out.config.embeddingModel)} in {visible(out.config.vectorRedis)}.</p>
    </Card>
  );
}

const STEP_LABEL = (st) => {
  if (st.do === "run") return st.guardBlocked ? "Run (the guard blocks it)" : "Run";
  if (st.do === "advance") return `Advance the clock by ${ms(st.ms)}`;
  if (st.do === "configure") return `Configure ${Object.entries(st.patch).map(([k, v]) => `${k} ${v}`).join(", ")}`;
  if (st.do === "storeDown") return `Switch ${st.store} off`;
  if (st.do === "storeUp") return `Switch ${st.store} on`;
  return st.do;
};

// A played scenario: whether every hand-written expected result holds first, then each step, then the expected results themselves.
export function ScenarioResult({ played, def }) {
  const steps = played.result.steps;
  const failed = played.checks.filter((c) => !c.pass);
  return (
    <div className="stack" data-testid="scenario-result">
      <Card tone={played.ok ? "ok" : "danger"} kicker={`Scenario: ${played.title}`} testId="verdict">
        <h2 className="card__title" data-testid="verdict-title"><Chip state={played.ok ? "ok" : "bad"} testId="verdict-chip">{played.ok ? "EXPECTED" : "DIFFERS"}</Chip> {played.ok ? `all ${played.checks.length} expected results hold` : `${failed.length} of ${played.checks.length} expected results differ`}</h2>
        <p data-testid="verdict-line">{visible(played.story)}</p>
        <p data-testid="verdict-outcomes">Outcomes in order: {steps.filter((s) => s.outcome).map((s, i) => <span key={i} className="nomr">{i > 0 ? ", " : ""}<OutcomeChip outcome={s.outcome} /></span>)}.</p>
        {!played.ok && <p className="field-error" role="alert" data-testid="expectation-differs">{visible(failed.map((c) => `${c.path} is ${JSON.stringify(c.actual)}, expected ${c.op} ${JSON.stringify(c.wanted)}`).join("; "))}</p>}
        <p className="muted">A scenario runs on its own fresh lab and clock and never touches the live key. The expected results were written by hand before the engine ran.</p>
      </Card>
      <section className="card card--neutral" data-testid="scenario-steps" aria-label="Scenario steps">
        <p className="kicker">Every step, in order</p>
        <div className="scroll">
          <table className="tbl tbl--wide">
            <caption className="sr-only">Scenario steps</caption>
            <thead><tr><th scope="col">#</th><th scope="col">Step</th><th scope="col">Prompt or detail</th><th scope="col">Outcome</th><th scope="col">Score</th><th scope="col">Lab clock</th></tr></thead>
            <tbody>
              {steps.map((s, i) => {
                const st = def?.steps[i] || { do: s.do };
                return (
                  <tr key={i} data-testid={`step-${i}`}>
                    <td>{i + 1}</td>
                    <td>{visible(STEP_LABEL(st))}{st.key ? ` (key ${visible(st.key)})` : ""}</td>
                    <td>{st.prompt ? visible(st.prompt) : ""}</td>
                    <td>{s.outcome ? <OutcomeChip outcome={s.outcome} testId={`step-outcome-${i}`} /> : <span className="muted">no model call</span>}</td>
                    <td>{s.outcome ? fmtScore(s.similarity) : ""}</td>
                    <td>{s.clockMs === undefined ? "" : ms(s.clockMs)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card card--neutral" data-testid="scenario-checks" aria-label="Expected results">
        <p className="kicker">Expected results (hand-written)</p>
        <div className="scroll">
          <table className="tbl tbl--wide">
            <caption className="sr-only">Expected results</caption>
            <thead><tr><th scope="col">Path</th><th scope="col">Rule</th><th scope="col">Expected</th><th scope="col">Actual</th><th scope="col">Holds</th></tr></thead>
            <tbody>
              {played.checks.map((c, i) => (
                <tr key={i} data-testid={`check-${i}`}>
                  <td><code>{visible(c.path)}</code></td><td>{c.op}</td>
                  <td>{c.than !== undefined ? `the value at ${visible(c.than)}` : visible(JSON.stringify(c.wanted))}</td>
                  <td>{visible(JSON.stringify(c.actual))}</td>
                  <td><Chip state={c.pass ? "ok" : "bad"}>{c.pass ? "yes" : "no"}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">Model calls made: {played.result.providerCalls}. Usage in this scenario: {Object.entries(played.result.usage).map(([k, u]) => `key ${visible(k)}: ${u.requests} requests, ${u.fromCache} from cache, ${u.saved} saved`).join("; ")}.</p>
      </section>
    </div>
  );
}

// Everything one run left: the verdict, Usage, the trace, what the run left behind and the raw result.
export default function Result({ last, usage, usageClock, savedUnit, scenarios, obs, source }) {
  const top = useRef(null);
  const runId = last?.runId;
  // On a narrow screen the result sits below the form: bring the verdict into view when a run finishes.
  useEffect(() => { if (runId && top.current && window.matchMedia?.("(max-width: 900px)").matches) top.current.scrollIntoView({ block: "start" }); }, [runId]);
  const usageCard = usage ? <Usage usage={usage} clockMs={usageClock} savedUnit={savedUnit} /> : null;
  if (!last) {
    return (
      <div className="stack">
        <Card tone="neutral" kicker="Result" title="No run yet" testId="result-empty">
          <p>Pick a scenario above or press Run on your own key. The verdict (HIT with its score and the entry it matched, or MISS) appears here first, then Usage, the score against the strictness, the gateway trace and what the run left behind.</p>
          <GatewayTrace exchanges={[]} source="mock" title="What the gateway did (simulated)" basisNote={BASIS} />
          <RunObservability record={null} source={source} streams={obs?.streams || []} />
        </Card>
        {usageCard}
      </div>
    );
  }
  const { trace } = last;
  const def = last.kind === "scenario" ? scenarios.find((s) => s.id === last.id) : null;
  return (
    <div className="stack" data-testid="result" data-run={runId} ref={top}>
      {last.kind === "scenario" ? <ScenarioResult played={last.played} def={def} /> : <Verdict out={last.out} prompt={last.prompt} />}
      {usageCard}
      {last.kind === "scenario" && <p className="muted" data-testid="usage-note">Usage above is the live key's: a scenario counts its own calls and the live key is untouched.</p>}
      <GatewayTrace exchanges={trace?.exchanges || []} source="mock" title="What the gateway did (simulated)" basisNote={BASIS} hot={["error", "ok", "outcome", "servedBy", "similarity"]} />
      <RunObservability record={obs?.record ?? null} source={source} streams={obs?.streams || []} title="What this run left behind" />
      <p className="muted" data-testid="obs-note">{OBS_NOTE}</p>
      <details className="card card--neutral" data-testid="raw-result">
        <summary>The raw result</summary>
        <Json value={last.kind === "scenario" ? last.played : last.out} label="The raw result" hot={HOT} />
      </details>
    </div>
  );
}
