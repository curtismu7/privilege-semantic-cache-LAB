import { Card, Chip } from "../components/Bits.jsx";
import { visible } from "../safeText";

// An open question is a card with NO result: nothing here runs, scores or answers. It is rendered from `openQuestions` in GET /api/info.
export default function OpenQuestions({ items }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div className="stack" data-testid="open-questions">
      {items.map((q) => (
        <Card key={q.id} tone="neutral" kicker="Open question" title={visible(q.title)} testId={`open-question-${q.id}`}>
          <p><Chip state="info">open</Chip> <span className="muted">No result is shown for this.</span></p>
          <p data-testid="open-question-text">{visible(q.question)}</p>
          <p className="muted">{visible(q.note)}</p>
        </Card>
      ))}
    </div>
  );
}
