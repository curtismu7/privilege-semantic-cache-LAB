import { describe, expect, it } from "vitest";
import { fireEvent } from "@testing-library/react";
import { BANNER } from "../../../server/src/banner.js";
import { validateConfig } from "../../../server/src/customer.js";
import { jsonResponse } from "./harness.js";
import { nav, screen, text, useLabHarness, waitFor, within } from "./util.jsx";

const h = useLabHarness();
const PAGES = ["Semantic cache", "Diagram", "Stories and talk track", "Limits (UNVERIFIED)"];

describe("shell: banner, mode toggle, presenter, talk track, reset", () => {
  it("shows the simulation banner FIRST in the page on every page, with the server's own words", async () => {
    const user = await h.mount();
    for (const p of PAGES) {
      await nav(user, p);
      expect(document.querySelector("main").firstElementChild, p).toBe(screen.getByTestId("banner"));
      expect(text("banner"), p).toBe(BANNER); // the server's own words
      expect(text("banner")).toMatch(/UNVERIFIED/);
    }
  });

  it("shows the mode in the header and a Mock / Real toggle: Mock pressed, Real DISABLED with the plain reason from the server", async () => {
    await h.mount();
    expect(text("mode")).toBe("Mock");
    expect(screen.getByTestId("mode-mock")).toHaveAttribute("aria-pressed", "true");
    const real = screen.getByTestId("mode-real");
    expect(real).toBeDisabled();
    const info = await h.lab.json("/api/info");
    expect(real).toHaveAttribute("title", info.realReason);
    expect(text("real-reason")).toBe(info.realReason);
    expect(info.realReason).toMatch(/not built yet/);
  });

  it("the server's 409 for Real is shown as the server worded it (a stale page that still asks)", async () => {
    // a page that was told Real is available (the server still refuses it)
    const user = await h.mount({ overrides: { "/api/info": async (_init, _u, go) => { const r = await go(); return jsonResponse(200, { ...(await r.json()), realAvailable: true }); } } });
    const real = screen.getByTestId("mode-real");
    expect(real).not.toBeDisabled();
    await user.click(real);
    await waitFor(() => expect(screen.getByTestId("mode-error-banner")).toHaveTextContent(/not built yet/));
    expect(text("mode")).toBe("Mock");
    const posts = h.lab.calls.filter((c) => c.path === "/api/mode" && c.method === "POST");
    expect(posts.map((c) => c.body)).toEqual([{ source: "real" }]);
  });

  it("Mock switches back and all data is loaded again", async () => {
    const user = await h.mount();
    const before = h.lab.calls.filter((c) => c.path === "/api/info").length;
    await user.click(screen.getByTestId("mode-mock"));
    await waitFor(() => expect(h.lab.calls.filter((c) => c.path === "/api/info").length).toBeGreaterThan(before));
    expect(h.lab.calls.some((c) => c.path === "/api/mode" && c.body?.source === "mock")).toBe(true);
  });

  it("names a server that is down instead of a blank page, and offers a retry", async () => {
    await h.mount({ overrides: { "/api/info": () => jsonResponse(502, { error: "bad_gateway", message: "The lab server did not answer." }) } }).catch(() => {});
    expect(await screen.findByTestId("load-error")).toHaveTextContent(/Could not load the lab/);
    expect(screen.getByTestId("retry")).toBeInTheDocument();
    expect(screen.getByTestId("banner").textContent.length).toBeGreaterThan(40);
  });

  it("presenter mode keeps the banner first and shows the talk-track line for the page; P toggles and Escape leaves", async () => {
    const user = await h.mount();
    await user.click(screen.getByTestId("presenter"));
    expect(document.querySelector("main").firstElementChild).toBe(screen.getByTestId("banner"));
    expect(screen.getByTestId("presenter-say")).toHaveTextContent(/only claims taken from the 2026-11-21 release notes/);
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.getByTestId("presenter")).toHaveAttribute("aria-pressed", "false"));
    fireEvent.keyDown(window, { key: "p" });
    expect(screen.getByTestId("presenter")).toHaveAttribute("aria-pressed", "true");
    await nav(user, "Diagram");
    expect(screen.getByTestId("presenter-say")).toHaveTextContent(/Everything is simulated/);
    expect(screen.getByTestId("banner")).toBeInTheDocument();
  });

  it("the talk track dialog opens with every section, filled for the vertical", async () => {
    const user = await h.mount();
    await user.click(screen.getByTestId("talk-track-toggle"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getAllByText(/Northwind Retail/).length).toBeGreaterThan(0);
    expect(dialog.textContent).toMatch(/A paraphrase above the strictness is a hit, and the score is shown/);
    expect(dialog.textContent).not.toMatch(/\{\{/);
  });

  it("Reset clears the last run and says what it did", async () => {
    const user = await h.mount();
    await user.click(await screen.findByTestId("scenario-exact-repeat-hits"));
    await screen.findByTestId("verdict");
    expect(window.location.hash).toBe("#cache/exact-repeat-hits");
    await user.click(screen.getByTestId("reset"));
    await waitFor(() => expect(screen.getByTestId("reset-note")).toHaveTextContent(/Reset: the key is back/));
    await screen.findByTestId("result-empty");
    // the scenario is out of the address, so the page that remounts does not run it again
    expect(window.location.hash).toBe("#cache");
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByTestId("verdict")).toBeNull();
    expect(screen.getByText("No run yet")).toBeInTheDocument();
    expect(h.lab.calls.some((c) => c.path === "/api/reset" && c.method === "POST")).toBe(true);
  });

  it("every page has a first-level heading and the page's own intro line", async () => {
    const user = await h.mount();
    for (const p of PAGES) { await nav(user, p); expect(screen.getByTestId("head-intro").textContent.length, p).toBeGreaterThan(30); }
    expect(document.querySelectorAll("h1")).toHaveLength(1);
  });

  it("the first story load sends no vertical, so a customer.config vertical and its cast reach the page; a later pick sends it", async () => {
    const user = await h.mount({ customer: validateConfig({ vertical: "health", cast: { brand: "Acme Test Clinic" } }) });
    const first = h.lab.calls.filter((c) => c.path === "/api/story")[0];
    expect(first.search).toBe("");
    await nav(user, "Stories and talk track");
    expect(text("stories-for")).toContain("Acme Test Clinic");
    expect(screen.getByTestId("vertical-select")).toHaveValue("health");
    await user.selectOptions(screen.getByTestId("vertical-select"), "finance");
    await waitFor(() => expect(h.lab.calls.filter((c) => c.path === "/api/story").at(-1).search).toBe("?vertical=finance"));
  });

  it("P toggles the presenter only as a plain key: not with ctrl, meta or alt, not held down, not while typing or on a button", async () => {
    await h.mount();
    const on = () => screen.getByTestId("presenter").getAttribute("aria-pressed");
    expect(on()).toBe("false");
    fireEvent.keyDown(window, { key: "p", ctrlKey: true }); fireEvent.keyDown(window, { key: "p", metaKey: true }); fireEvent.keyDown(window, { key: "p", altKey: true });
    fireEvent.keyDown(window, { key: "p", repeat: true });
    expect(on()).toBe("false");
    fireEvent.keyDown(await screen.findByTestId("prompt"), { key: "p" });
    fireEvent.keyDown(screen.getByTestId("run"), { key: "p" });
    expect(on()).toBe("false");
    fireEvent.keyDown(document.body, { key: "p" });
    expect(on()).toBe("true");
  });

  it("a multi-paragraph talk-track section is one paragraph per blank line in the presenter, the stories and the dialog text", async () => {
    const user = await h.mount();
    await user.click(screen.getByTestId("presenter"));
    expect(within(screen.getByTestId("presenter-say")).getAllByText(/./, { selector: "p" }).length).toBeGreaterThan(1);
    await nav(user, "Stories and talk track");
    expect(screen.getByTestId("talk-general").querySelectorAll("p").length).toBeGreaterThan(4);
    expect(screen.getByTestId("story-say-S01").querySelectorAll("p").length).toBeGreaterThanOrEqual(1);
  });

  it("the workspace id the page sends is accepted by the server's own pattern", async () => {
    await h.mount();
    const { SERVER_PATTERN } = await import("../workspace.js");
    expect(h.lab.ws()).toMatch(SERVER_PATTERN);
    expect(SERVER_PATTERN.source).toBe("^[a-z0-9][a-z0-9-]{0,31}$");
    expect((await h.lab.json("/api/key")).config).toBeTruthy();
  });
});
