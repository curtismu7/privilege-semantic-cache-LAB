// Rule 19: the Mock / Real toggle in the header of every page. Two buttons, the current mode pressed (aria-pressed, filled accent from the shared
// .mode-toggle block). A press asks the server (POST /api/mode with exactly { source }) and the lab reloads all its data after it. Real is disabled
// with the server's plain reason as its tooltip (and as hidden text a screen reader reads) while the server says it is not available.
export default function ModeToggle({ source, info, onSwitch }) {
  const realOff = info ? info.realAvailable === false : false;
  const how = info?.realReason || "Real is not available. Mock keeps working.";
  return (
    <span className="mode-toggle" role="group" aria-label="Mock or Real" data-testid="mode-toggle">
      <button type="button" aria-pressed={source === "mock"} onClick={() => onSwitch("mock")} data-testid="mode-mock" title="Mock: mock models and a lab clock in this process, nothing leaves the machine">Mock</button>
      <button type="button" aria-pressed={source === "real"} disabled={realOff} onClick={() => onSwitch("real")} data-testid="mode-real" aria-describedby={realOff ? "real-reason" : undefined}
        title={realOff ? how : "Real: one read-only look at a tenant (owner-run)"}>Real</button>
      {realOff && <span id="real-reason" className="sr-only" data-testid="real-reason">{how}</span>}
    </span>
  );
}
