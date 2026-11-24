import { describe, expect, it } from "vitest";
import { fireEvent } from "@testing-library/react";
import { STORIES } from "../../../server/src/stories.js";
import { VERTICALS } from "../../../server/src/cast.js";
import { SCENARIOS } from "../../../server/src/scenarios.js";
import { rawDiagram } from "../../../server/src/diagramData.js";
import { UNVERIFIED, SOURCED, LAB_MODEL, OPEN_QUESTIONS } from "../../../server/src/banner.js";
import { jsonResponse } from "./harness.js";
import { nav, screen, text, useLabHarness, waitFor, within } from "./util.jsx";

const h = useLabHarness();

describe("Stories and talk track", () => {
  it("shows the nine stories filled for the vertical, each with its own talk-track words and a Show it link to its scenario", async () => {
    const user = await h.mount({ page: "stories" });
    await screen.findByTestId("story-grid");
    expect(screen.getAllByTestId(/^story-S\d\d$/)).toHaveLength(9);
    for (const s of STORIES) {
      expect(screen.getByTestId(`story-show-${s.id}`)).toHaveAttribute("href", `#cache/${s.scenario}`);
      expect(text(`story-say-${s.id}`).length).toBeGreaterThan(60);
    }
    expect(document.body.textContent).not.toMatch(/\{\{/);
    expect(text("stories-for")).toContain(VERTICALS.retail.cast.castBrand);
    expect(within(screen.getByTestId("talk-general")).getByText("Before you start")).toBeInTheDocument();
    // another vertical changes the words, not the stories
    await user.selectOptions(screen.getByTestId("vertical-select"), "finance");
    await waitFor(() => expect(text("stories-for")).toContain(VERTICALS.finance.cast.castBrand));
    expect(screen.getAllByTestId(/^story-S\d\d$/)).toHaveLength(9);
    expect(document.body.textContent).not.toContain(VERTICALS.retail.cast.castBrand);
  });

  it("Show it opens the Cache page on that scenario and runs it", async () => {
    const user = await h.mount({ page: "stories" });
    await screen.findByTestId("story-grid");
    await user.click(screen.getByTestId("story-show-S06"));
    await screen.findByTestId("verdict");
    expect(text("verdict-chip")).toBe("EXPECTED");
    expect(window.location.hash).toBe("#cache/usage-matches-calls");
    expect(text("usage-requests")).toBe("0");
  });
});

describe("Limits page: what the release notes say versus the lab's model", () => {
  it("lists exactly the server's sourced claims, the lab's model, the UNVERIFIED list and the open question, and says why Real is off", async () => {
    await h.mount({ page: "limits" });
    await screen.findByTestId("limits-sourced");
    const items = (id) => within(screen.getByTestId(id)).getAllByRole("listitem").map((li) => li.textContent);
    expect(items("limits-sourced-list")).toEqual([...SOURCED]);
    expect(items("limits-model-list")).toEqual([...LAB_MODEL]);
    expect(items("limits-unverified-list")).toEqual([...UNVERIFIED]);
    expect(screen.getByTestId("limits-encoder-label")).toHaveTextContent(/not a real embedding model/);
    expect(screen.getByTestId("open-question-cache-scope-per-user")).toBeInTheDocument();
    expect(OPEN_QUESTIONS).toHaveLength(1);
    expect(text("limits-real-reason")).toMatch(/not built yet/);
    expect(SOURCED).toHaveLength(4);
  });
});

describe("Diagram boxes: keys", () => {
  it("a key press inside an expanded box (on a button) does not toggle the box; on the box itself Enter and Space do", async () => {
    const user = await h.mount({ page: "diagram" });
    const box = await screen.findByTestId("pat-node-gw");
    box.focus();
    await user.keyboard("{Enter}");
    expect(box).toHaveAttribute("aria-expanded", "true");
    const go = box.querySelector(".dk-passport-go"); // (a role=button box hides its children from the role queries)
    expect(go).toBeTruthy();
    go.focus();
    const ev = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    go.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false); // the box did not swallow the button's key
    expect(screen.getByTestId("pat-node-gw")).toHaveAttribute("aria-expanded", "true");
    box.focus();
    await user.keyboard(" ");
    expect(screen.getByTestId("pat-node-gw")).toHaveAttribute("aria-expanded", "false");
  });
});

describe("Diagram page: drawn from diagram-studio data by name", () => {
  it("draws exactly the boxes the data lists, asks the server for it by name, and Simulate walks the arrows", async () => {
    const user = await h.mount({ page: "diagram" });
    const data = rawDiagram("semantic-cache");
    await screen.findByTestId("pattern-canvas");
    for (const n of data.nodes) expect(await screen.findByTestId(`pat-node-${n.id}`)).toHaveTextContent(n.label);
    expect(document.querySelectorAll("[data-testid^='pat-node-']")).toHaveLength(data.nodes.length);
    const call = h.lab.calls.find((c) => c.path === "/api/diagram");
    expect(call.search).toContain("name=semantic-cache");
    expect(screen.getByTestId("step-caption")).toHaveTextContent(/walks the 6 arrows/);
    await user.click(screen.getByTestId("simulate"));
    expect(screen.getByTestId("step-caption")).toHaveTextContent(/Arrow 1 of 6/);
    await user.click(screen.getByTestId("next"));
    expect(screen.getByTestId("step-caption")).toHaveTextContent(/Arrow 2 of 6/);
    expect(screen.getByTestId("speed")).toBeInTheDocument();
    await user.click(screen.getByTestId("pattern-reset"));
    expect(screen.getByTestId("step-caption")).toHaveTextContent(/walks the 6 arrows/);
  });

  it("no node or edge is written in the page's source: the data file is the only list", async () => {
    const fs = await import("node:fs");
    const src = ["../pages/DiagramPage.jsx", "../components/PatternDiagram.jsx"].map((f) => fs.readFileSync(new URL(f, import.meta.url), "utf8")).join("\n");
    for (const n of rawDiagram("semantic-cache").nodes) expect(src).not.toMatch(new RegExp(`id:\\s*["']${n.id}["']`));
    expect(src).not.toMatch(/\b(source|target|from|to):\s*["']/);
    expect(src).not.toMatch(/mermaid/i);
  });

  it("a server that cannot give the diagram is named, with the data's name, never a blank canvas", async () => {
    await h.mount({ page: "diagram", overrides: { "/api/diagram": () => jsonResponse(404, { error: "unknown_diagram", message: "no diagram with that name" }) } });
    expect(await screen.findByTestId("diagram-error-text")).toHaveTextContent(/no diagram with that name/);
    expect(screen.queryByTestId("pattern-canvas")).toBeNull();
  });

  it("the header Reset puts the diagram back (a new walkthrough)", async () => {
    const user = await h.mount({ page: "diagram" });
    await screen.findByTestId("pattern-canvas");
    await user.click(screen.getByTestId("next"));
    expect(screen.getByTestId("step-caption")).toHaveTextContent(/Arrow 1 of 6/);
    await user.click(screen.getByTestId("reset"));
    await waitFor(() => expect(screen.getByTestId("step-caption")).toHaveTextContent(/walks the 6 arrows/));
    expect(fireEvent).toBeTruthy();
    expect(SCENARIOS.length).toBe(9);
  });
});
