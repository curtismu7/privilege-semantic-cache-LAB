import { visible } from "../safeText";

// A talk-track `say` holds paragraphs joined by a blank line: one <p> each, never one run-on paragraph.
export const paragraphs = (say) => String(say ?? "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

// The presenter's lines for a page: the talk-track items for it, as the server worded them.
export default function PresenterSay({ say, heading }) {
  return (
    <aside className="presenter-say" data-testid="presenter-say" aria-label="Talk track" hidden={say.length === 0}>
      {heading && <p className="kicker" data-testid="presenter-beat">{heading}</p>}
      {say.map((t) => paragraphs(t.say).map((p, i) => (
        <p key={`${t.id}-${i}`}>{i === 0 && <strong>{visible(t.title)}. </strong>}{visible(p)}</p>
      )))}
    </aside>
  );
}
