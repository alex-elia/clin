import {
  contactNextActionLabel,
  type ContactPlaybook,
} from "@/lib/contactPlaybook";

type Props = {
  playbook: ContactPlaybook | null;
  icpRationale?: string | null;
  className?: string;
};

export function RecommendationPanel({
  playbook,
  icpRationale,
  className = "",
}: Props) {
  if (!playbook && !icpRationale?.trim()) return null;

  return (
    <div
      className={`rounded-md border border-[var(--clin-border)] bg-[var(--clin-surface-muted)]/40 px-3 py-2 text-sm ${className}`}
    >
      {playbook ? (
        <>
          <p className="text-xs font-medium text-[var(--clin-text)]">
            {contactNextActionLabel(playbook.action)}
            {playbook.confidence !== "low" ? (
              <span className="ml-2 font-normal text-[var(--clin-muted)]">
                ({playbook.confidence} confidence)
              </span>
            ) : null}
          </p>
          {playbook.strategic_summary ? (
            <p className="mt-1 text-[var(--clin-muted)]">
              {playbook.strategic_summary}
            </p>
          ) : (
            <p className="mt-1 text-[var(--clin-muted)]">{playbook.rationale}</p>
          )}
          <p className="mt-1 font-medium text-[var(--clin-text)]">
            {playbook.playbook}
          </p>
          {playbook.posts_signals?.suggested_comment_angle ? (
            <p className="mt-1 text-xs text-[var(--clin-muted)]">
              Comment angle: {playbook.posts_signals.suggested_comment_angle}
            </p>
          ) : null}
        </>
      ) : null}
      {!playbook && icpRationale?.trim() ? (
        <p className="text-[var(--clin-muted)]">{icpRationale}</p>
      ) : null}
      {icpRationale?.trim() && playbook?.campaign_overlay ? (
        <p className="mt-2 border-t border-[var(--clin-border)] pt-2 text-xs text-[var(--clin-muted)]">
          Campaign ICP: {icpRationale}
        </p>
      ) : null}
    </div>
  );
}
