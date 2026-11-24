import { Chip } from "./Bits.jsx";

export const fmtScore = (n) => (typeof n === "number" ? n.toFixed(3) : "none");
// A score equal to the strictness is a hit (the engine's rule).
export const isHit = (score, strictness) => typeof score === "number" && score >= strictness;

// The score against the strictness line, as a bar AND as words (never colour alone). The fill is the score, the vertical line is the strictness:
// the fill reaching the line (or passing it) is a HIT. `score` null means there was nothing in the cache to compare with.
export default function ScoreBar({ score, strictness, testId = "scorebar", caption }) {
  const hit = isHit(score, strictness);
  const pct = typeof score === "number" ? Math.max(0, Math.min(100, score * 100)) : 0;
  const line = Math.max(0, Math.min(100, strictness * 100));
  const words = score === null || score === undefined
    ? `Nothing live in the cache to compare with, so it is a MISS at any strictness.`
    : `Score ${fmtScore(score)} against a strictness of ${strictness}: ${hit ? "the score is at or above the line" : "the score is below the line"}.`;
  return (
    <div className="scorebar" data-testid={testId} data-hit={score === null || score === undefined ? "none" : hit ? "hit" : "miss"}>
      <div className="scorebar__track" role="img" aria-label={`${words}`}>
        <span className="scorebar__fill" data-hit={hit ? "hit" : "miss"} style={{ width: `${pct}%` }} />
        <span className="scorebar__line" style={{ left: `${line}%` }} />
      </div>
      <div className="scorebar__scale" aria-hidden="true"><span>0</span><span>1</span></div>
      <p className="scorebar__words">
        <Chip state={score === null || score === undefined ? "info" : hit ? "ok" : "info"} testId={`${testId}-verdict`}>{score === null || score === undefined ? "MISS" : hit ? "HIT" : "MISS"}</Chip>{" "}
        <span data-testid={`${testId}-words`}>{caption ? `${caption} ` : ""}{words}</span>
      </p>
    </div>
  );
}
