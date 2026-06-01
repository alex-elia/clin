"use client";

type PostAutopilotFinaleProps = {
  onGoToHandoff: () => void;
};

/** Success strip after autopilot — full preview lives in page footer. */
export function PostAutopilotFinale({ onGoToHandoff }: PostAutopilotFinaleProps) {
  return (
    <div className="clin-autopilot-finale">
      <div className="clin-autopilot-finale-header">
        <span className="clin-autopilot-finale-badge" aria-hidden>
          ✓
        </span>
        <div>
          <h3 className="text-lg font-semibold text-[var(--clin-text)]">
            Autopilot complete
          </h3>
          <p className="mt-0.5 text-sm text-[var(--clin-muted)]">
            Your draft is in the sections below. Review preview &amp; handoff,
            save if needed, then mark ready for the extension.
          </p>
        </div>
      </div>
      <button type="button" className="clin-btn-primary mt-3" onClick={onGoToHandoff}>
        Go to preview &amp; handoff
      </button>
    </div>
  );
}
