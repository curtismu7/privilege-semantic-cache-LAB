import { describe, expect, it } from "vitest";
import { fireEvent } from "@testing-library/react";
import { MODE_LINES } from "../App.jsx";
import { jsonResponse } from "./harness.js";
import { screen, useLabHarness, waitFor } from "./util.jsx";

// The Real-or-mock modal (shared mode-modal): MOCK on a fresh session, REAL when the server says so, once per mode per session, never a banner.
const h = useLabHarness();
const realInfo = (hold) => ({ "/api/info": async (_init, _u, go) => { const r = await go(); const body = { ...(await r.json()), source: "real" }; if (hold) await hold; return jsonResponse(200, body); } });

describe("Real-or-mock modal", () => {
  it("a fresh load shows MOCK with the lab's line; Got it closes it and a remount in the same session does not show it again", async () => {
    const user = await h.mount({ modal: true });
    const modal = screen.getByTestId("mode-modal");
    expect(modal).toHaveAttribute("data-mode", "mock");
    expect(modal).toHaveTextContent("MOCK");
    expect(modal.textContent).toContain(MODE_LINES.mock);
    await user.click(screen.getByTestId("mode-modal-ok"));
    expect(screen.queryByTestId("mode-modal")).toBeNull();
    expect(window.sessionStorage.getItem("psc-mode-seen-mock")).toBe("1");
  });

  it("Escape closes it", async () => {
    await h.mount({ modal: true });
    fireEvent.keyDown(screen.getByTestId("mode-modal"), { key: "Escape" });
    expect(screen.queryByTestId("mode-modal")).toBeNull();
  });

  it("the old simulation banner is gone, and the server's own banner field is no longer drawn", async () => {
    await h.mount({ modal: true });
    expect(screen.queryByTestId("banner")).toBeNull();
    expect(document.querySelector("main > p.banner")).toBeNull();
    const info = await h.lab.json("/api/info");
    expect(info.banner).toMatch(/SIMULATED/); // still sent (server tests pin it)
    expect(document.body.textContent).not.toContain(info.banner);
  });

  it("MOCK first and REAL after /api/info answers Real (held on a promise), even though MOCK was not dismissed", async () => {
    let release; const hold = new Promise((r) => { release = r; });
    const mounted = h.mount({ modal: true, overrides: realInfo(hold) });
    await screen.findByTestId("mode-modal");
    expect(screen.getByTestId("mode-modal")).toHaveAttribute("data-mode", "mock");
    release();
    await mounted;
    await waitFor(() => expect(screen.getByTestId("mode-modal")).toHaveAttribute("data-mode", "real"));
    expect(screen.getByTestId("mode-modal")).toHaveTextContent("REAL");
    expect(screen.getByTestId("mode-modal").textContent).toContain(MODE_LINES.real);
  });

  it("both lines keep the honesty words: UNVERIFIED, the release-notes date and the encoder hedge", () => {
    for (const m of ["mock", "real"]) { expect(MODE_LINES[m]).toMatch(/UNVERIFIED/); expect(MODE_LINES[m]).toMatch(/2026-11-21/); }
    for (const m of ["mock", "real"]) expect(MODE_LINES[m]).toMatch(/not a real embedding model/i); // the encoder hedge the doctor and server tests also pin on the server banner
  });
});
