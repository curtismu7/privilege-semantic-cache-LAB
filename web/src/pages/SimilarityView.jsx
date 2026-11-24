import { useCallback, useEffect, useState } from "react";
import { postSimilarity } from "../api";
import { Card } from "../components/Bits.jsx";
import ScoreBar from "../components/ScoreBar.jsx";
import { visible } from "../safeText";

// Sample pairs are only inputs for the encoder: what each one scores is computed by the server, never written here.
const PAIRS = [
  { id: "reword", label: "A reworded question", a: "What are your opening hours on Sunday?", b: "What time do you open on Sunday?" },
  { id: "close", label: "A close paraphrase", a: "Explain how photosynthesis works", b: "Can you explain how photosynthesis works?" },
  { id: "unrelated", label: "Two unrelated questions", a: "How do I reset my password?", b: "What is the capital of France?" },
];

// The same pair against a strictness line you can move: the score never changes, only the line does, and the verdict flips where they cross.
// Read only: it asks POST /api/similarity, which touches no cache, no Usage and no clock.
export default function SimilarityView({ embeddingModel, strictness, setStrictness, limits }) {
  const [a, setA] = useState(PAIRS[0].a);
  const [b, setB] = useState(PAIRS[0].b);
  const [score, setScore] = useState(undefined); // undefined = not scored yet
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const ask = useCallback(async (x = a, y = b) => {
    setBusy(true); setError(null);
    const r = await postSimilarity(x, y, embeddingModel);
    setBusy(false);
    if (!r.ok) { setError(r.body?.message || `HTTP ${r.status}`); setScore(undefined); return; }
    setScore(r.body.similarity);
  }, [a, b, embeddingModel]);
  useEffect(() => { ask(); }, [embeddingModel]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (p) => { setA(p.a); setB(p.b); ask(p.a, p.b); };
  const s = Number.isNaN(strictness) ? 0 : Math.min(1, Math.max(0, strictness));
  return (
    <Card kicker="Similarity" title="One pair against the strictness line" testId="similarity-view">
      <p className="muted">The score is the stand-in encoder's (hashed character n-grams, not a real embedding model): it measures shared words, not meaning. Move the strictness and the same pair flips between HIT and MISS. Nothing is stored or counted here.</p>
      <div className="seg" role="group" aria-label="Sample pairs">
        {PAIRS.map((p) => <button key={p.id} type="button" onClick={() => pick(p)} data-testid={`pair-${p.id}`}>{p.label}</button>)}
      </div>
      <div className="pair">
        <label>An earlier prompt (in the cache)
          <textarea rows={2} value={a} onChange={(e) => { setA(e.target.value); setScore(undefined); }} maxLength={limits.maxPromptChars + 1000} data-testid="pair-a" />
        </label>
        <label>A new prompt
          <textarea rows={2} value={b} onChange={(e) => { setB(e.target.value); setScore(undefined); }} maxLength={limits.maxPromptChars + 1000} data-testid="pair-b" />
        </label>
      </div>
      <div className="seg">
        <button type="button" onClick={() => ask()} disabled={busy} data-testid="pair-score">Score this pair</button>
        <span className="muted">Encoder: <code>{visible(embeddingModel)}</code></span>
      </div>
      {error && <p className="field-error" role="alert" data-testid="pair-error">{visible(error)}</p>}
      <label>Strictness (the same setting as in the key form; not saved until you save the key)
        <span className="strict">
          <input type="range" min="0" max="1" step="0.01" value={s} onChange={(e) => setStrictness(Number(e.target.value))} data-testid="pair-strictness-range" aria-label="Strictness preview slider" />
          <output data-testid="pair-strictness-value">{s.toFixed(2)}</output>
        </span>
      </label>
      {score !== undefined && <ScoreBar score={score} strictness={s} testId="pair-bar" caption="This pair:" />}
    </Card>
  );
}
