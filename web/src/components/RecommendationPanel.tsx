import {
  contactNextActionLabel,
  type ContactPlaybook,
} from "@/lib/contactPlaybook";

type Props = {
  playbook: ContactPlaybook | null;
  icpRationale?: string | null;
  className?: string;
};

function sectionLabel(text: string) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--clin-muted)]">
      {text}
    </p>
  );
}

export function RecommendationPanel({
  playbook,
  icpRationale,
  className = "",
}: Props) {
  if (!playbook && !icpRationale?.trim()) return null;

  const analysisText =
    playbook?.strategic_summary?.trim() || playbook?.rationale?.trim();
  const hasAdvice = Boolean(
    playbook?.playbook?.trim() || playbook?.posts_signals,
  );

  return (
    <div
      className={`rounded-md border border-[var(--clin-border)] bg-[var(--clin-surface-muted)]/40 px-3 py-2.5 text-sm ${className}`}
    >
      {playbook && analysisText ? (
        <section>
          {sectionLabel("Analysis")}
          <p className="mt-1 text-[var(--clin-muted)]">{analysisText}</p>
        </section>
      ) : null}

      {playbook && hasAdvice ? (
        <section className={analysisText ? "mt-3" : undefined}>
          {sectionLabel("Advice")}
          <p className="mt-1 font-medium text-[var(--clin-text)]">
            {contactNextActionLabel(playbook.action)}
            {playbook.confidence !== "low" ? (
              <span className="ml-1.5 font-normal text-[var(--clin-muted)]">
                ({playbook.confidence} confidence)
              </span>
            ) : null}
          </p>
          {playbook.playbook?.trim() ? (
            <p className="mt-1 text-[var(--clin-text)]">{playbook.playbook}</p>
          ) : null}
          {playbook.posts_signals?.suggested_comment_angle ? (
            <p className="mt-1.5 text-xs text-[var(--clin-muted)]">
              <span className="font-medium text-[var(--clin-text)]">
                Comment angle:{" "}
              </span>
              {playbook.posts_signals.suggested_comment_angle}
            </p>
          ) : null}
          {playbook.posts_signals?.engagement_hook &&
          !playbook.posts_signals?.suggested_comment_angle ? (
            <p className="mt-1.5 text-xs text-[var(--clin-muted)]">
              <span className="font-medium text-[var(--clin-text)]">Hook: </span>
              {playbook.posts_signals.engagement_hook}
            </p>
          ) : null}
        </section>
      ) : null}

      {!playbook && icpRationale?.trim() ? (
        <p className="text-[var(--clin-muted)]">{icpRationale}</p>
      ) : null}

      {icpRationale?.trim() && playbook ? (
        <section className="mt-3 border-t border-[var(--clin-border)] pt-2">
          {sectionLabel("Campaign fit")}
          <p className="mt-1 text-xs text-[var(--clin-muted)]">{icpRationale}</p>
        </section>
      ) : null}
    </div>
  );
}
