import { useEffect, useRef, useState } from "react";
import TopMenu, { applyFontSize } from "./top-menu/TopMenu.jsx";
import TalkTrackDialog from "./talk-track/TalkTrackDialog.jsx";
import ModeToggle from "./components/ModeToggle.jsx";
import PresenterSay from "./components/PresenterSay.jsx";
import useLab from "./hooks/useLab";
import CachePage from "./pages/CachePage.jsx";
import DiagramPage from "./pages/DiagramPage.jsx";
import StoriesPage from "./pages/StoriesPage.jsx";
import LimitsPage from "./pages/LimitsPage.jsx";
import { visible } from "./safeText";
import { FORGOTTEN_EVENT } from "./workspace";

export const PAGES = [
  { id: "cache", label: "Semantic cache", View: CachePage },
  { id: "diagram", label: "Diagram", View: DiagramPage },
  { id: "stories", label: "Stories and talk track", View: StoriesPage },
  { id: "limits", label: "Limits (UNVERIFIED)", View: LimitsPage },
];
// Shown until the server's own banner has loaded: never blank, and never claiming more than it knows.
export const BANNER_UNKNOWN = "SIMULATED. A mock gateway, a stand-in encoder (NOT a real embedding model), a vector store stand-in, a mock model and a lab clock; nothing leaves this machine. Everything beyond the 2026-11-21 release notes is this lab's own model and UNVERIFIED.";
// One line per page above the content.
const PAGE_INTRO = {
  cache: "An LLM key reuses an earlier answer for a similar prompt. Run a scenario or your own prompt: the verdict says HIT or MISS and why, then Usage, how close the score is to the strictness, and what the run left behind.",
  diagram: "The flow from the app to the key's cache and the model, drawn from diagram-studio data. Drag the boxes, Simulate the arrows, Reset puts everything back.",
  stories: "Nine stories as data, told for an invented company. Each one opens the scenario it teaches. The talk track is the script behind them.",
  limits: "Exactly what the release notes say, and what is this lab's own model. The cache scope is an open question.",
};
// Which talk-track items the presenter sees on each page (ids from the server's talkTrack). The Cache page shows the story of the scenario in view.
const PRESENTER_TALK = { diagram: ["what-is-simulated-and-what-is-not"], limits: ["what-is-simulated-and-what-is-not"], stories: ["before-you-start"] };
const THEME_KEY = "psc.theme";
const FONT_KEY = "psc.font";
const THEMES = ["auto", "light", "dark"];
function initialTheme() { try { const v = localStorage.getItem(THEME_KEY); if (THEMES.includes(v)) return v; } catch { /* storage blocked */ } return "auto"; }
function initialFont() { try { const f = localStorage.getItem(FONT_KEY); return ["S", "M", "L"].includes(f) ? f : "M"; } catch { return "M"; } }
// "#cache/<scenario>" opens the Cache page and runs that scenario: the page is the part before the slash.
const pageFromHash = () => { const h = window.location.hash.replace("#", "").split("/")[0]; return PAGES.some((p) => p.id === h) ? h : "cache"; };

export default function App() {
  const lab = useLab();
  const [page, setPage] = useState(pageFromHash());
  const [presenter, setPresenter] = useState(false);
  const [talkOpen, setTalkOpen] = useState(false);
  const [theme, setTheme] = useState(initialTheme);
  const [fontStep, setFontStep] = useState(initialFont);
  const [resetMsg, setResetMsg] = useState("");
  const [forgotten, setForgotten] = useState(false);
  const forgottenRef = useRef(lab.workspaceForgotten);
  forgottenRef.current = lab.workspaceForgotten;

  useEffect(() => { if (theme === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme; }, [theme]);
  // The server forgot this tab's workspace (the 20-workspace cap, a restart) and built a fresh one: say so, and show the defaults.
  useEffect(() => { const on = () => { setForgotten(true); forgottenRef.current(); }; window.addEventListener(FORGOTTEN_EVENT, on); return () => window.removeEventListener(FORGOTTEN_EVENT, on); }, []);
  useEffect(() => { applyFontSize(fontStep); try { localStorage.setItem(FONT_KEY, fontStep); } catch { /* not remembered */ } }, [fontStep]);
  useEffect(() => { const on = () => setPage(pageFromHash()); window.addEventListener("hashchange", on); return () => window.removeEventListener("hashchange", on); }, []);
  useEffect(() => {
    const on = (e) => {
      // Only a plain "p": not with ctrl, meta or alt (browser and OS shortcuts), not a held key, and not while typing or on a control.
      if (e.target && (/^(INPUT|TEXTAREA|SELECT|BUTTON|SUMMARY|A)$/.test(e.target.tagName) || e.target.isContentEditable)) { if (e.key !== "Escape") return; }
      if ((e.key === "p" || e.key === "P") && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat) setPresenter((v) => !v);
      else if (e.key === "Escape") setPresenter(false);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  const pickTheme = (next) => { try { if (next === "auto") localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, next); } catch { /* not remembered */ } setTheme(next); };
  const select = (id) => { setPage(id); try { window.history.replaceState(null, "", `#${id}`); } catch { /* ignore */ } };
  // A scenario in the address ("#cache/<scenario>") runs when the page is opened that way. Anything that restarts the page (Reset, a mode switch, a
  // vertical change) leaves only the page in the address, so the remount does not run the scenario again.
  const clearScenarioHash = () => { try { window.history.replaceState(null, "", `#${page}`); } catch { /* ignore */ } };
  const switchMode = async (source) => { if (source !== lab.source) clearScenarioHash(); return lab.switchMode(source); };
  const pickVertical = (v) => { clearScenarioHash(); lab.setVertical(v); };
  const reset = async () => {
    clearScenarioHash();
    setForgotten(false);
    const ok = await lab.reset();
    setResetMsg(ok ? "Reset: the key is back to its default config with an empty cache, the lab clock is at zero, every store is back on, the last run is cleared and the diagram is back in place." : "Reset failed on the server; the view was reloaded.");
  };

  const { source, story, info } = lab;
  const banner = info?.banner || BANNER_UNKNOWN;
  const View = PAGES.find((p) => p.id === page).View;
  // The stored run is { kind, id, played, runId, trace }: a scenario run names its scenario in `id`.
  const sc = lab.last?.kind === "scenario" ? story?.stories.find((s) => s.scenario === lab.last.id) : null;
  const say = !story ? [] : page === "cache" ? story.talkTrack.filter((x) => x.id === (sc ? sc.id : "before-you-start")) : story.talkTrack.filter((x) => (PRESENTER_TALK[page] || []).includes(x.id));

  return (
    <div className={`app${presenter ? " app--presenter" : ""}`}>
      <header className="shell-bar">
        <span className="shell-brand">
          <span className="shell-logo" aria-hidden="true">PSC</span>
          <h1>{visible(story?.name || "Privilege Semantic Cache LAB")}</h1>
          {source && <span className="shell-badge" data-testid="mode" title="Mock: nothing leaves this machine">{source === "real" ? "Real" : "Mock"}</span>}
        </span>
        <nav className="shell-nav" aria-label="Lab sections">
          {PAGES.map((p) => <a key={p.id} href={`#${p.id}`} aria-current={page === p.id ? "page" : undefined} onClick={(e) => { e.preventDefault(); select(p.id); }}>{p.label}</a>)}
        </nav>
        <TopMenu
          vertical={{ value: lab.vertical || story?.vertical || "retail", onChange: pickVertical, options: story ? story.verticals.map((v) => v.id) : ["retail"] }}
          theme={{ value: theme, onChange: pickTheme }}
          fontSize={{ value: fontStep, onChange: setFontStep }}
          present={{ active: presenter, onToggle: () => setPresenter((v) => !v), label: "Presenter (P)" }}
          talkTrack={{ active: talkOpen, onToggle: () => setTalkOpen((v) => !v) }}
          help={{ href: "https://github.com/curtismu7/privilege-semantic-cache-LAB#readme" }}
          version={info?.version ? `v${info.version}` : null}
          onReset={reset}
          extra={<ModeToggle source={source || "mock"} info={info} onSwitch={switchMode} />}
        />
      </header>
      <main className="page">
        <p className="banner" role="note" data-state={source === "real" ? "live" : "mock"} data-testid="banner">{banner}</p>
        {lab.modeError && <p className="field-error" role="alert" data-testid="mode-error-banner">{lab.modeError}</p>}
        {lab.error && (
          <div className="field-error" role="alert" data-testid="load-error">
            <p>Could not load the lab ({lab.error}). Is the server running?</p>
            <button type="button" onClick={lab.reload} data-testid="retry">Try again</button>
          </div>
        )}
        {forgotten && (
          <p className="reset-note" role="status" data-testid="workspace-forgotten">
            The server forgot this workspace; the lab was reset to its defaults. <button type="button" onClick={() => setForgotten(false)} data-testid="workspace-forgotten-dismiss">Dismiss</button>
          </p>
        )}
        <p className={resetMsg ? "reset-note" : "sr-only"} role="status" aria-live="polite" data-testid="reset-note">{resetMsg}</p>
        {!presenter && <div className="page-head"><p className="head__intro" data-testid="head-intro">{PAGE_INTRO[page]}</p></div>}
        {presenter && <PresenterSay say={say} heading={null} />}
        <div id={`panel-${page}`}>
          {lab.error && !story ? null : !story || !info ? <p className="muted" role="status">Loading...</p> : <View key={`${page}-${lab.epoch}`} lab={lab} />}
        </div>
      </main>
      <TalkTrackDialog isOpen={talkOpen} onClose={() => setTalkOpen(false)} talk={(story?.talkTrack ?? []).map((t) => ({ ...t, title: visible(t.title), say: visible(t.say) }))} />
    </div>
  );
}
