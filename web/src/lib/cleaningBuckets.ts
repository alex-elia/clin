import type { ContactReadiness } from "@/lib/contactReadinessShared";
import type { LlmAnalysisView } from "@/lib/contactLlmDisplay";

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
}): CleaningBucket {
  const plan = input.analysis?.cleaningPlan;
  if (plan && isCleaningBucket(plan.bucket)) {
    if (
      plan.bucket !== "enrich_first" ||
      input.readiness.profileDepth === "missing"
    ) {
      return plan.bucket;
    }
  }

  if (!input.readiness.readyForDecisions) {
    return "enrich_first";
  }

  if (!input.hasLlmAnalysis) {
    return "needs_review";
  }

  const stewardship = input.analysis?.stewardship?.recommendation;
  if (
    stewardship === "consider_removing" ||
    input.segment === "remove_candidate" ||
    input.analysis?.suggestedActions.includes("consider_removing")
  ) {
    return "review_remove";
  }

  const fit = input.analysis?.outreachFit?.recommendation;
  if (fit === "reach_out") return "reach_out_dm";
  if (fit === "skip") {
    return stewardship === "keep" ? "keep_passive" : "review_remove";
  }
  if (fit === "nurture") {
    const r = input.analysis?.modelScores?.r ?? 0;
    if (r >= 55 && input.readiness.hasMessagingCapture === false) {
      return "engage_comment";
    }
    return "nurture_light";
  }

  if (input.analysis?.suggestedActions.includes("write")) {
    return "reach_out_dm";
  }
  if (input.analysis?.suggestedActions.includes("visit_profile")) {
    return "enrich_first";
  }
  if (input.analysis?.suggestedActions.includes("stay_connected")) {
    return "nurture_light";
  }

  return "needs_review";
}

export function bucketSuggestedQueueText(
  bucket: CleaningBucket,
  analysis: LlmAnalysisView | null,
): string {
  const playbook = analysis?.cleaningPlan?.playbook?.trim();
  if (playbook) return playbook;

  switch (bucket) {
    case "enrich_first":
      return "Capture full profile on LinkedIn (extension Import & enrich).";
    case "review_remove":
      return "Review whether to disconnect on LinkedIn — Clin does not remove for you.";
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
