import { useEffect, useState } from "react";
import PatternDiagram from "../components/PatternDiagram.jsx";
import { Card, Loading } from "../components/Bits.jsx";
import { getDiagram } from "../api";
import { visible } from "../safeText";

// The diagram is diagram-studio/1 data loaded BY NAME from the server (rule 17); no node or edge is drawn from a list in this file.
export const DIAGRAM = "semantic-cache";

export default function DiagramPage({ lab }) {
  const [pattern, setPattern] = useState(null);
  const [error, setError] = useState(null);
  const vertical = lab.vertical;
  useEffect(() => {
    let live = true; // a late answer for a vertical the visitor has already left is dropped
    setPattern(null); setError(null);
    getDiagram(DIAGRAM, vertical).then((r) => {
      if (!live) return;
      if (r.ok && Array.isArray(r.body?.nodes) && Array.isArray(r.body?.steps)) setPattern(r.body);
      else setError(r.body?.message || `HTTP ${r.status}`);
    });
    return () => { live = false; };
  }, [vertical]);
  return (
    <div className="stack">
      {error && (
        <Card tone="warn" kicker="Diagram" title="This diagram could not be loaded" testId="diagram-error">
          <p role="alert" data-testid="diagram-error-text">{visible(error)}</p>
          <p className="muted">The diagram is drawn from diagram-studio data the server serves by name (<code>{DIAGRAM}</code>); the page never draws a box that the data does not list.</p>
        </Card>
      )}
      {!error && !pattern && <Loading />}
      {pattern && <PatternDiagram key={`${DIAGRAM}-${vertical}-${lab.epoch}`} pattern={pattern} resetSignal={lab.epoch} />}
    </div>
  );
}
