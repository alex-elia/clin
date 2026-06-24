import type { ContactReadiness } from "@/lib/contactReadinessShared";
import type { LlmAnalysisView } from "@/lib/contactLlmDisplay";
import {
  activityTierAllowsEngage,
  type LinkedInActivityTier,
} from "@/lib/linkedinActivity";
import {
  cleaningAdviceFromThread,
  threadSuggestsRemoval,
} from "@/lib/cleaningThreadHelpers";
import type { InboxThreadAnalysis } from "@/lib/inboxThreadAnalysisTypes";

export const CLEANING_BUCKETS = [
  "enrich_first",
  "needs_review",
  "review_remove",
  "reach_out_dm",
  "engage_comment",
  "nurture_light",
  "keep_passive",
] as const;

export type CleaningBucket = (typeof CLEANING_BUCKETS)[number];

export type CleaningBucketMeta = {
  id: CleaningBucket;
  title: string;
  description: string;
  sort: number;
};

export const CLEANING_BUCKET_META: CleaningBucketMeta[] = [
  {
    id: "enrich_first",
    title: "Enrich first",
    description:
      "Capture a full LinkedIn profile (and optionally messages) before deciding.",
    sort: 0,
  },
  {
    id: "needs_review",
    title: "Needs review",
    description:
      "Enough data but no analysis yet, or the model was unsure — run analysis or decide manually.",
    sort: 1,
  },
  {
    id: "review_remove",
    title: "Review removal",
    description:
      "Stale, low-fit, or stewardship suggests pruning your connection list.",
    sort: 2,
  },
  {
    id: "reach_out_dm",
    title: "Reach out (DM)",
    description:
      "Strong fit — prepare a personalized message or add to a campaign.",
    sort: 3,
  },
  {
    id: "engage_comment",
    title: "Engage (comment)",
    description:
      "Light touch: comment on a post or react before a cold DM.",
    sort: 4,
  },
  {
    id: "nurture_light",
    title: "Nurture",
    description: "Keep warm; revisit when timing or data improves.",
    sort: 5,
  },
  {
    id: "keep_passive",
    title: "Keep as-is",
    description: "No urgent action — monitor or skip outreach for now.",
    sort: 6,
  },
];

const VALID_BUCKETS = new Set<string>(CLEANING_BUCKETS);

export function isCleaningBucket(v: string): v is CleaningBucket {
  return VALID_BUCKETS.has(v);
}

export function resolveCleaningBucket(input: {
  readiness: ContactReadiness;
  analysis: LlmAnalysisView | null;
  segment: string;
  hasLlmAnalysis: boolean;
  threadAnalysis?: InboxThreadAnalysis | null;
  cleaningUserBucket?: CleaningBucket | null;
  cleaningDismissedAt?: number | null;
  activityTier?: LinkedInActivityTier | null;
}): CleaningBucket | null {
  if (input.cleaningDismissedAt) return null;

  if (input.cleaningUserBucket && isCleaningBucket(input.cleaningUserBucket)) {
    return input.cleaningUserBucket;
  }

  let bucket: CleaningBucket | null = null;

  const plan = input.analysis?.cleaningPlan;
  if (plan && isCleaningBucket(plan.bucket)) {
    if (
      plan.bucket !== "enrich_first" ||
      input.readiness.profileDepth === "missing"
    ) {
      bucket = plan.bucket;
    }
  }

  if (!bucket) {
    if (!input.readiness.readyForDecisions) {
      bucket = "enrich_first";
    } else if (!input.hasLlmAnalysis) {
      bucket = "needs_review";
    } else {
      const thread = input.threadAnalysis;
      if (threadSuggestsRemoval(thread)) {
        bucket = "review_remove";
      } else if (thread?.thread_stage === "social_only") {
        bucket = "keep_passive";
      } else {
        const stewardship = input.analysis?.stewardship?.recommendation;
        if (
          stewardship === "consider_removing" ||
          input.segment === "remove_candidate" ||
          input.analysis?.suggestedActions.includes("consider_removing")
        ) {
          bucket = "review_remove";
        } else if (input.segment === "ghost" && thread) {
          if (
            thread.thread_stage === "ghosted" ||
            thread.thread_stage === "cold_no_reply"
          ) {
            bucket = "review_remove";
          } else if (stewardship !== "keep") {
            bucket = "needs_review";
          }
        }

        if (!bucket) {
          const fit = input.analysis?.outreachFit?.recommendation;
          if (fit === "reach_out") bucket = "reach_out_dm";
          else if (fit === "skip") {
            bucket =
              stewardship === "keep" ? "keep_passive" : "review_remove";
          } else if (fit === "nurture") {
            const r = input.analysis?.modelScores?.r ?? 0;
            if (r >= 55 && input.readiness.hasMessagingCapture === false) {
              bucket = "engage_comment";
            } else {
              bucket = "nurture_light";
            }
          } else if (
            input.analysis?.suggestedActions.includes("write")
          ) {
            bucket = "reach_out_dm";
          } else if (
            input.analysis?.suggestedActions.includes("visit_profile")
          ) {
            bucket = "enrich_first";
          } else if (
            input.analysis?.suggestedActions.includes("stay_connected")
          ) {
            bucket = "nurture_light";
          } else {
            bucket = "needs_review";
          }
        }
      }
    }
  }

  return applyActivityBucketGuards(bucket, input.activityTier);
}

function applyActivityBucketGuards(
  bucket: CleaningBucket | null,
  activityTier?: LinkedInActivityTier | null,
): CleaningBucket | null {
  if (!bucket || !activityTier || activityTier === "unknown") return bucket;

  if (
    bucket === "engage_comment" &&
    !activityTierAllowsEngage(activityTier)
  ) {
    return "nurture_light";
  }

  if (
    bucket === "reach_out_dm" &&
    (activityTier === "lurker" || activityTier === "dormant")
  ) {
    return "nurture_light";
  }

  return bucket;
}

export function bucketSuggestedQueueText(
  bucket: CleaningBucket,
  analysis: LlmAnalysisView | null,
  threadAnalysis?: InboxThreadAnalysis | null,
): string {
  const threadAdvice = cleaningAdviceFromThread(threadAnalysis);
  if (threadAdvice && bucket === "review_remove") return threadAdvice;

  const playbook = analysis?.cleaningPlan?.playbook?.trim();
  if (playbook) return playbook;

  switch (bucket) {
    case "enrich_first":
      return "Capture full profile on LinkedIn (extension Import & enrich).";
    case "review_remove":
      return (
        threadAdvice ||
        "Review whether to disconnect on LinkedIn — Clin does not remove for you."
      );
    case "reach_out_dm":
      return analysis?.outreachFit?.rationale
        ? `Reach out: ${analysis.outreachFit.rationale}`
        : "Strong fit — draft outreach or add to a campaign.";
    case "engage_comment":
      return "Engage lightly (comment or react) before a DM.";
    case "nurture_light":
      return "Nurture — no pitch now; revisit later.";
    case "keep_passive":
      return "Keep in network — no action needed now.";
    default:
      return "Review when you have time — run AI analysis if missing.";
  }
}

export function bucketQueuePriority(bucket: CleaningBucket): number {
  switch (bucket) {
    case "review_remove":
      return 3;
    case "reach_out_dm":
      return 2;
    case "needs_review":
      return 1;
    default:
      return 0;
  }
}
