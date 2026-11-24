import { useCallback, useEffect, useRef, useState } from "react";
import { getInfo, getObservability, getStory, postReset, postRun, postScenario, setMode } from "../api";

const say = (r, what) => r.body?.message || `${what} failed (HTTP ${r.status})`;

/**
 * The lab's one data hook. It holds the info (source, realAvailable, the banner), the story and talk track for the picked vertical, and the last run
 * (so a visitor can leave the Cache page and come back to it) with the record the run left behind. `switchMode` is the rule 19 toggle: POST
 * /api/mode with exactly { source }, then every piece of data is loaded again. `epoch` goes up on a switch, a Reset or a new vertical so a page starts over.
 *
 * The first story load sends NO vertical: the server answers with the configured customer vertical and cast, and the page adopts it. (A default
 * parameter would turn "nothing picked yet" into a vertical and hide customer.config.)
 */
export default function useLab() {
  const [vertical, setVerticalState] = useState(null); // null until the server has said which vertical is configured
  const [info, setInfo] = useState(null);
  const [story, setStory] = useState(null);
  const [error, setError] = useState(null);
  const [modeError, setModeError] = useState(null);
  const [last, setLast] = useState(null); // { kind: "live" | "scenario", out | played, runId, trace } or null before any run
  const [obs, setObs] = useState(null); // the run-observability answer for the last run
  const [busy, setBusy] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const seq = useRef(0);

  const load = useCallback(async (v) => {
    const mine = ++seq.current; // a late answer for a vertical or a mode the visitor has left is dropped
    const [i, s] = await Promise.all([getInfo(), getStory(v || undefined)]);
    if (mine !== seq.current) return;
    const bad = [i, s].find((r) => !r.ok);
    if (bad) { setError(say(bad, "Loading the lab")); return; }
    setError(null); setInfo(i.body); setStory(s.body);
    setVerticalState(s.body.vertical);
  }, []);

  useEffect(() => { load(undefined); }, [load]);
  const setVertical = useCallback((v) => { setVerticalState(v); setEpoch((n) => n + 1); load(v); }, [load]);

  // Rule 19: the server decides. A 409 (Real not available) is shown as the server worded it; nothing else changes.
  const switchMode = useCallback(async (source) => {
    const r = await setMode(source);
    if (!r.ok) { setModeError(r.body?.message || `The mode did not change (HTTP ${r.status})`); return { ok: false, message: r.body?.message }; }
    setModeError(null); setLast(null); setObs(null); setEpoch((n) => n + 1);
    await load(vertical);
    return { ok: true };
  }, [load, vertical]);

  const refreshObs = useCallback(async () => {
    const r = await getObservability();
    setObs(r.ok ? r.body : { record: { error: r.body?.error || "run_observability_failed", message: r.body?.message || `HTTP ${r.status}` }, streams: [] });
  }, []);

  // A run is data, a miss or an error included. Only a transport or validation failure (4xx/5xx on the request itself) is returned as { ok: false }.
  const runLive = useCallback(async (prompt, guardBlocked) => {
    setBusy(true);
    try {
      const r = await postRun(prompt, guardBlocked);
      if (!r.ok) return { ok: false, status: r.status, message: say(r, "The run"), code: r.body?.error };
      const { runId, trace, ...out } = r.body;
      setLast({ kind: "live", out, prompt, runId, trace });
      await refreshObs();
      return { ok: true };
    } finally { setBusy(false); }
  }, [refreshObs]);

  const runScenario = useCallback(async (id) => {
    setBusy(true);
    try {
      const r = await postScenario(id);
      if (!r.ok) return { ok: false, status: r.status, message: say(r, "The scenario"), code: r.body?.error };
      const { runId, trace, ...played } = r.body;
      setLast({ kind: "scenario", id, played, runId, trace });
      await refreshObs();
      return { ok: true };
    } finally { setBusy(false); }
  }, [refreshObs]);

  const reset = useCallback(async () => {
    const r = await postReset();
    setLast(null); setObs(null); setEpoch((n) => n + 1);
    await load(vertical);
    return r.ok;
  }, [load, vertical]);

  return { vertical, setVertical, info, story, source: info?.source || null, error, modeError, last, obs, busy, epoch, reload: () => load(vertical), switchMode, runLive, runScenario, reset };
}
