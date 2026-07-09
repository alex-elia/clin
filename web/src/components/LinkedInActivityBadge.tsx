import {
  LINKEDIN_ACTIVITY_TIER_LABELS,
  type LinkedInActivityTier,
} from "@/lib/linkedinActivity";

const TIER_CLASS: Record<LinkedInActivityTier, string> = {
  active:
    "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100",
  occasional:
    "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100",
  lurker:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100",
  dormant:
    "border-zinc-300 bg-zinc-100 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900/50 dark:text-zinc-200",
  unknown:
    "border-clin-border bg-clin-surface-muted text-clin-muted",
};

const SHORT_LABEL: Record<LinkedInActivityTier, string> = {
  active: "Active",
  occasional: "Occasional",
  lurker: "Lurker",
  dormant: "Dormant",
  unknown: "Unknown",
};

type Props = {
  tier: LinkedInActivityTier | null | undefined;
  score?: number | null;
  newestPostAgeLabel?: string | null;
  compact?: boolean;
  className?: string;
};

export function LinkedInActivityBadge({
  tier,
  score,
  newestPostAgeLabel,
  compact = false,
  className = "",
}: Props) {
  if (!tier) return null;
  const label = compact ? SHORT_LABEL[tier] : LINKEDIN_ACTIVITY_TIER_LABELS[tier];
  const title = [
    LINKEDIN_ACTIVITY_TIER_LABELS[tier],
    score != null ? `Score ${score}/100` : null,
    newestPostAgeLabel ? `Newest post: ${newestPostAgeLabel}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <span
      title={title}
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${TIER_CLASS[tier]} ${className}`}
    >
      {label}
      {!compact && score != null ? (
        <span className="ml-1 opacity-75">{score}</span>
      ) : null}
    </span>
  );
}

export function linkedInActivityWarnBeforeEngage(
  tier: LinkedInActivityTier | null | undefined,
): string | null {
  if (tier === "lurker") {
    return "LinkedIn activity is low — only stale posts visible. Engage may not land well.";
  }
  if (tier === "dormant") {
    return "No visible posts on their profile — comment-first outreach may be harder.";
  }
  return null;
}
