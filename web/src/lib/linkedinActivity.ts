import {
  estimatePostAgeDays,
  filterRecentProfilePosts,
  isStaleLinkedInPostAge,
  MAX_RELEVANT_POST_AGE_DAYS,
  sortPostsByEstimatedAge,
} from "@/lib/profilePostRecency";
import type { ProfilePostKind } from "@/lib/profilePostKinds";

export const LINKEDIN_ACTIVITY_TIERS = [
  "active",
  "occasional",
  "lurker",
  "dormant",
  "unknown",
] as const;

export type LinkedInActivityTier = (typeof LINKEDIN_ACTIVITY_TIERS)[number];

export const LINKEDIN_ACTIVITY_TIER_LABELS: Record<LinkedInActivityTier, string> =
  {
    active: "Active on LinkedIn",
    occasional: "Occasional poster",
    lurker: "Low activity (stale posts only)",
    dormant: "No visible posts",
    unknown: "Activity unknown",
  };

/** Posting within this window (≈3 months) required for "active" tier. */
export const ACTIVE_POST_AGE_DAYS = 90;

export type ProfilePostActivityLike = {
  text?: string;
  ageLabel?: string;
  postKind?: ProfilePostKind | string;
};

export type LinkedInActivityAssessment = {
  tier: LinkedInActivityTier;
  /** 0–100 reachability; null when tier is unknown (no posts capture). */
  score: number | null;
  recentPostCount: number;
  stalePostCount: number;
  totalPostCount: number;
  newestPostAgeLabel: string | null;
  estimatedNewestPostDays: number | null;
  originalRecentCount: number;
  postsCapturedAt: string | null;
  reasons: string[];
};

export function isLinkedInActivityTier(v: string): v is LinkedInActivityTier {
  return (LINKEDIN_ACTIVITY_TIERS as readonly string[]).includes(v);
}

function isOriginalKind(kind: string | undefined): boolean {
  return kind === "original" || !kind || kind === "unknown";
}

function isVeryRecentPost(
  ageLabel: string | null | undefined,
  now: Date,
): boolean {
  const days = estimatePostAgeDays(ageLabel, now);
  return days != null && days <= ACTIVE_POST_AGE_DAYS;
}

function scoreForTier(
  tier: LinkedInActivityTier,
  veryRecentCount: number,
): number | null {
  switch (tier) {
    case "active":
      return Math.min(100, 78 + veryRecentCount * 4);
    case "occasional":
      return 58;
    case "lurker":
      return 18;
    case "dormant":
      return 28;
    case "unknown":
      return null;
    default:
      return null;
  }
}

/** Minimum activity score to queue engage (occasional+). */
export const MIN_ACTIVITY_SCORE_FOR_ENGAGE = 50;

export function activityTierAllowsEngage(
  tier: LinkedInActivityTier | null | undefined,
): boolean {
  return tier === "active" || tier === "occasional";
}

export function formatLinkedInActivityForPrompt(
  assessment: LinkedInActivityAssessment,
): string {
  const parts = [
    `tier=${assessment.tier}`,
    assessment.score != null ? `score=${assessment.score}` : "score=unknown",
    `recent=${assessment.recentPostCount}`,
    `stale=${assessment.stalePostCount}`,
    assessment.newestPostAgeLabel
      ? `newest="${assessment.newestPostAgeLabel}"`
      : "newest=none",
    assessment.estimatedNewestPostDays != null
      ? `newest_days≈${assessment.estimatedNewestPostDays}`
      : null,
    assessment.postsCapturedAt ? `captured_at=${assessment.postsCapturedAt}` : null,
  ].filter(Boolean);
  const reasons =
    assessment.reasons.length > 0
      ? ` reasons: ${assessment.reasons.join("; ")}`
      : "";
  return `LINKEDIN_ACTIVITY: ${parts.join(" ")}.${reasons}`;
}

/**
 * Compute LinkedIn posting activity from a posts capture (or unknown if never captured).
 */
export function computeLinkedInActivity(input: {
  profilePosts?: ProfilePostActivityLike[] | null;
  postsCapturedAt?: string | null;
  /** When false, tier is unknown (no posts page captured). */
  hasPostsCapture?: boolean;
  now?: Date;
}): LinkedInActivityAssessment {
  const now = input.now ?? new Date();
  const hasCapture = input.hasPostsCapture !== false;
  const postsCapturedAt = input.postsCapturedAt ?? null;

  if (!hasCapture) {
    return {
      tier: "unknown",
      score: null,
      recentPostCount: 0,
      stalePostCount: 0,
      totalPostCount: 0,
      newestPostAgeLabel: null,
      estimatedNewestPostDays: null,
      originalRecentCount: 0,
      postsCapturedAt: null,
      reasons: ["Posts activity page not captured yet — do not penalize reachability."],
    };
  }

  const raw = (input.profilePosts ?? []).filter(
    (p) => typeof p.text === "string" && p.text.trim().length >= 8,
  );
  const sorted = sortPostsByEstimatedAge(raw, now);

  if (sorted.length === 0) {
    return {
      tier: "dormant",
      score: scoreForTier("dormant", 0),
      recentPostCount: 0,
      stalePostCount: 0,
      totalPostCount: 0,
      newestPostAgeLabel: null,
      estimatedNewestPostDays: null,
      originalRecentCount: 0,
      postsCapturedAt,
      reasons: [
        "Posts page captured but no visible posts in feed — likely low public activity or privacy.",
      ],
    };
  }

  const recent = filterRecentProfilePosts(sorted, now);
  const veryRecent = recent.filter((p) => isVeryRecentPost(p.ageLabel, now));
  const stalePostCount = sorted.filter((p) =>
    isStaleLinkedInPostAge(p.ageLabel, now),
  ).length;
  const newest = sorted[0] ?? null;
  const newestPostAgeLabel = newest?.ageLabel?.trim() ?? null;
  const estimatedNewestPostDays = newest
    ? estimatePostAgeDays(newest.ageLabel, now)
    : null;
  const originalRecentCount = recent.filter((p) =>
    isOriginalKind(typeof p.postKind === "string" ? p.postKind : undefined),
  ).length;
  const hasVeryRecentActivity =
    estimatedNewestPostDays != null &&
    estimatedNewestPostDays <= ACTIVE_POST_AGE_DAYS;

  let tier: LinkedInActivityTier;
  const reasons: string[] = [];

  if (recent.length === 0) {
    tier = "lurker";
    reasons.push(
      `All ${sorted.length} captured post(s) are older than ${MAX_RELEVANT_POST_AGE_DAYS} days — low chance to engage via recent activity.`,
    );
  } else if (hasVeryRecentActivity) {
    tier = "active";
    reasons.push(
      veryRecent.length >= 2
        ? `${veryRecent.length} post(s) within the last ${ACTIVE_POST_AGE_DAYS} days (~3 months) — actively posting.`
        : `Most recent post within ~${ACTIVE_POST_AGE_DAYS} days (~3 months) — active enough to engage.`,
    );
  } else {
    tier = "occasional";
    reasons.push(
      `Posts within the last year but none within ~${ACTIVE_POST_AGE_DAYS} days (~3 months) — not currently very active on LinkedIn.`,
    );
    if (recent.length >= 2) {
      reasons.push(
        `${recent.length} post(s) in the last year; newest is older than 3 months.`,
      );
    }
  }

  if (originalRecentCount > 0 && tier !== "lurker") {
    reasons.push(`${originalRecentCount} original post(s) in the recent window.`);
  }

  return {
    tier,
    score: scoreForTier(tier, veryRecent.length),
    recentPostCount: recent.length,
    stalePostCount,
    totalPostCount: sorted.length,
    newestPostAgeLabel,
    estimatedNewestPostDays,
    originalRecentCount,
    postsCapturedAt,
    reasons,
  };
}
