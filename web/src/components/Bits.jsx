// Every JSON pane is the shared JsonPane (Form | JSON, full view, rule 24); it applies visible() to everything it shows.
import Json from "./JsonPane.jsx";
export { Json };

export const HOT = ["ok", "outcome", "servedBy", "similarity", "code", "status", "error", "message", "expect", "pass"];

// A status with a word and a state, so meaning never rests on colour alone (patterns section 7).
export function Chip({ state = "none", children, testId, wrap }) {
  return <span className={`tag${wrap ? " tag--wrap" : ""}`} data-state={state} data-testid={testId}>{children}</span>;
}

export const Card = ({ tone, title, kicker, children, testId, className = "" }) => (
  <section className={`card${tone ? ` card--${tone}` : ""} ${className}`.trim()} data-testid={testId}>
    {kicker && <p className="kicker">{kicker}</p>}
    {title && <h2 className="card__title">{title}</h2>}
    {children}
  </section>
);

export const Loading = () => <p className="muted" role="status">Loading...</p>;
