import { Card } from "../components/Bits.jsx";
import { paragraphs } from "../components/PresenterSay.jsx";
import { visible } from "../safeText";

// Stories are data with {{cast}} tokens, filled from the picked vertical pack (rule 10); the words to say come from docs/talk-track.md, one source.
// "Show it" opens the Cache page and runs the story's scenario there.
export default function StoriesPage({ lab }) {
  const { story } = lab;
  const talkById = Object.fromEntries(story.talkTrack.map((t) => [t.id, t]));
  const general = story.talkTrack.filter((t) => !/^S\d{2}$/.test(t.id));
  return (
    <div className="stack">
      <p className="muted" data-testid="stories-for">Told for <strong>{visible(story.cast.castBrand)}</strong>, an invented example (vertical: {visible(story.verticals.find((v) => v.id === story.vertical)?.label || story.vertical)}). Pick another vertical in the header; the engine and the numbers do not change, only the words.</p>
      <div className="card-grid card-grid--wide" data-testid="story-grid">
        {story.stories.map((s) => (
          <Card key={s.id} kicker={s.id} title={s.title} testId={`story-${s.id}`}>
            <dl className="kv kv--stack">
              <dt>Goal</dt><dd>{visible(s.goal)}</dd>
              <dt>Obstacle</dt><dd>{visible(s.obstacle)}</dd>
              <dt>What the control does</dt><dd>{visible(s.control)}</dd>
            </dl>
            <div className="story__say" data-testid={`story-say-${s.id}`}>{paragraphs(talkById[s.id]?.say).map((p, i) => <p key={i}>{visible(p)}</p>)}</div>
            <a className="button" href={`#cache/${s.scenario}`} data-testid={`story-show-${s.id}`}>Show it: run the {visible(s.scenario)} scenario</a>
          </Card>
        ))}
      </div>
      <section className="card card--neutral" data-testid="talk-general" aria-label="The rest of the talk track">
        <p className="kicker">Talk track</p>
        <h2 className="card__title">The rest of the script</h2>
        <div className="talk">
          {general.map((t) => <div key={t.id}><h3>{visible(t.title)}</h3>{paragraphs(t.say).map((p, i) => <p key={i}>{visible(p)}</p>)}</div>)}
        </div>
      </section>
    </div>
  );
}
