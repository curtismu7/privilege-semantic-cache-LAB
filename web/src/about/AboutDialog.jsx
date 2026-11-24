// What the version button opens: THIS lab's own short notes. (The shared ReleaseNotes dialog, vendored with the top menu, is another lab's text and is
// never shown here: App.jsx passes onVersion, so TopMenu does not render it.) The sourced claims are the server's own list (banner.js SOURCED), so
// nothing appears here that the Limits page does not say.
import FloatingDialog from "../floating-dialog/FloatingDialog";
import { visible } from "../safeText";

export default function AboutDialog({ isOpen, onClose, info, version }) {
  return (
    <FloatingDialog isOpen={isOpen} onClose={onClose} title="About this lab" ariaLabel="About this lab" defaultWidth={430} defaultHeight={null} placement="right" storageKey="about-dialog" singletonKey="about" noBackdrop testId="about-dialog">
      {info && (
        <div className="about" data-testid="about-text">
          <h2>{visible(info.name || "Privilege Semantic Cache LAB")} {visible(version || "")}</h2>
          <p>A Demo-tier lab. Mock only: a mock gateway, a stand-in encoder, a vector store stand-in, a mock model and a lab clock. Nothing leaves this machine.</p>
          <p>The encoder is a stand-in (hashed character n-grams): it is <strong>not a real embedding model</strong> and measures shared words, not meaning.</p>
          <p><strong>From the 2026-11-21 release notes:</strong></p>
          <ul>{(info.sourced || []).map((t) => <li key={t}>{visible(t)}</li>)}</ul>
          <p>Everything else is this lab's own model and UNVERIFIED. <a href="#limits" onClick={onClose} data-testid="about-limits-link">See the Limits page</a>.</p>
          <p className="muted">{visible(info.realReason)}</p>
        </div>
      )}
    </FloatingDialog>
  );
}
