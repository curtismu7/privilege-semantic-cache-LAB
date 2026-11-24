import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FORGOTTEN_EVENT, forgetWorkspace, workspaceFetch } from "../workspace.js";
import { postReset } from "../api.js";

// A fake server: every call is held until the test answers it, so the ORDER of the answers is the test's to choose.
function fakeServer() {
  const pending = [];
  vi.stubGlobal("fetch", () => new Promise((resolve) => { pending.push(resolve); }));
  const answer = (i, { fresh = false, status = 200 } = {}) => pending[i](new Response("{}", { status, headers: fresh ? { "x-workspace-fresh": "1" } : {} }));
  return { answer, count: () => pending.length };
}

describe("forgotten-workspace detection does not depend on the order of the answers", () => {
  let forgotten;
  const on = () => { forgotten += 1; };
  beforeEach(() => { forgotten = 0; forgetWorkspace(); window.addEventListener(FORGOTTEN_EVENT, on); });
  afterEach(() => { window.removeEventListener(FORGOTTEN_EVENT, on); vi.unstubAllGlobals(); });

  it("the parallel first calls of a new tab: whichever answers first, and whichever carries the header, nobody was forgotten", async () => {
    for (const order of [[0, 1, 2], [2, 1, 0], [1, 2, 0]]) {
      forgetWorkspace(); forgotten = 0;
      const s = fakeServer();
      const calls = [workspaceFetch("/api/info"), workspaceFetch("/api/key"), workspaceFetch("/api/usage")]; // all sent before any answer
      // the call that built the workspace (index 1) carries the header, and it may arrive first, last or in between
      for (const i of order) s.answer(i, { fresh: i === 1 });
      await Promise.all(calls);
      expect(forgotten, `order ${order}`).toBe(0);
      vi.unstubAllGlobals();
    }
  });

  it("a call SENT after a successful answer that comes back fresh is a forgotten workspace; the same call after this tab's own Reset is not", async () => {
    let s = fakeServer();
    const first = workspaceFetch("/api/key"); s.answer(0); await first; // a successful answer has arrived
    const later = workspaceFetch("/api/key"); s.answer(1, { fresh: true }); await later;
    expect(forgotten).toBe(1);
    vi.unstubAllGlobals();
    // own Reset: the next call is fresh on purpose
    forgetWorkspace(); forgotten = 0;
    s = fakeServer();
    const a = workspaceFetch("/api/key"); s.answer(0); await a;
    const reset = postReset(); s.answer(1); await reset;
    const next = workspaceFetch("/api/key"); s.answer(2, { fresh: true }); await next;
    expect(forgotten).toBe(0);
  });

  it("a Reset that failed does not arm the exception: the fresh answer after it is still reported", async () => {
    const s = fakeServer();
    const a = workspaceFetch("/api/key"); s.answer(0); await a;
    const reset = postReset(); s.answer(1, { status: 500 }); await reset;
    const next = workspaceFetch("/api/key"); s.answer(2, { fresh: true }); await next;
    expect(forgotten).toBe(1);
  });

  it("a refused call (4xx) proves nothing: a fresh answer after only refusals is not a forgotten workspace", async () => {
    const s = fakeServer();
    const bad = workspaceFetch("/api/run"); s.answer(0, { status: 400 }); await bad;
    const first = workspaceFetch("/api/key"); s.answer(1, { fresh: true }); await first;
    expect(forgotten).toBe(0);
  });
});
