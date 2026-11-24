import { Card } from "../components/Bits.jsx";
import OpenQuestions from "./OpenQuestions.jsx";
import { visible } from "../safeText";

// What the release notes say versus what is this lab's model. The lists come from the server (banner.js, the same text the banner draws on); nothing is written here.
export default function LimitsPage({ lab }) {
  const { info } = lab;
  const List = ({ items, testId }) => <ul className="plain" data-testid={testId}>{items.map((t) => <li key={t}>{visible(t)}</li>)}</ul>;
  return (
    <div className="stack">
      <div className="cols">
        <Card tone="ok" kicker="Sourced" title="What the 2026-11-21 release notes say" testId="limits-sourced">
          <List items={info.sourced} testId="limits-sourced-list" />
          <p className="muted">These are the only sourced claims in the lab. Nothing else on any page is a Ping statement.</p>
        </Card>
        <Card tone="warn" kicker="UNVERIFIED" title="Not in the release notes: this lab's own model" testId="limits-model">
          <List items={info.labModel} testId="limits-model-list" />
        </Card>
      </div>
      <Card tone="warn" kicker="UNVERIFIED" title="What the lab does not know" testId="limits-unverified">
        <List items={info.unverified} testId="limits-unverified-list" />
        <p className="muted">Each of these is the lab's own choice, shown so it can be checked against a real tenant. None is claimed to match the product.</p>
      </Card>
      <Card tone="warn" kicker="Not an embedding model" title="The encoder is a stand-in" testId="limits-encoder">
        <p data-testid="limits-encoder-label">The encoder here is a {visible(info.encoder.label)}. It exists so a run is repeatable and a test is stable. Do not read a score here as how a real embedding model would rate the pair.</p>
      </Card>
      <OpenQuestions items={info.openQuestions} />
      <Card tone="neutral" kicker="Real mode" title="Mock is the only mode today" testId="limits-real">
        <p data-testid="limits-real-reason">{visible(info.realReason)}</p>
        <p className="muted">The Real button in the header is disabled for that reason; the server answers 409 with the same words if it is asked anyway.</p>
      </Card>
    </div>
  );
}
