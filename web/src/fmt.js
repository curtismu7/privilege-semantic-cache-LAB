// Plain words for the engine's reason codes, shown beside the code so a presenter and the table say the same thing.
export const REASON = {
  served: "served",
  out_of_budget: "skipped: out of budget (no provider call)",
  budget_exceeded_after_call: "refused: budget exceeded after the call",
  provider_down: "failed: provider down (503)",
  provider_overloaded: "failed: overloaded (429 from the provider)",
  provider_timeout: "failed: timed out (504)",
};
export const reasonText = (r) => REASON[r] || String(r);
export const ms = (n) => `${n} ms`;
