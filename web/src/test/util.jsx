import { cleanup, configure, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach } from "vitest";
import App from "../App.jsx";
import { setJsonView } from "../components/JsonPane.jsx";
import { startLab } from "./harness.js";

// A real server and a real engine sit behind every click: give slow machines time before an assertion gives up.
configure({ asyncUtilTimeout: 6000 });

export { screen, waitFor, within, userEvent };

// Sets up one real lab per test and removes it after. `lab` is filled by mount().
export function useLabHarness() {
  const ctx = { lab: null };
  beforeEach(() => { try { window.localStorage.clear(); window.sessionStorage.clear(); } catch { /* ignore */ } window.location.hash = ""; setJsonView("raw"); });
  afterEach(async () => { cleanup(); if (ctx.lab) { await ctx.lab.stop(); ctx.lab = null; } });
  // The Real-or-mock modal opens on every fresh session; a test that is not about it starts with both modes already dismissed (modal: true keeps it).
  ctx.mount = async ({ page, modal = false, ...opts } = {}) => {
    ctx.lab = await startLab(opts);
    if (!modal) { try { window.sessionStorage.setItem("psc-mode-seen-mock", "1"); window.sessionStorage.setItem("psc-mode-seen-real", "1"); } catch { /* ignore */ } }
    if (page) window.location.hash = `#${page}`;
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("navigation", { name: "Lab sections" });
    await waitFor(() => { if (!document.querySelector("[data-testid='mode']")) throw new Error("not loaded"); });
    return user;
  };
  return ctx;
}

export const nav = async (user, label) => { await user.click(within(screen.getByRole("navigation", { name: "Lab sections" })).getByRole("link", { name: label })); };
export const text = (id) => screen.getByTestId(id).textContent;
