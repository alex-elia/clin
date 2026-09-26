/** Client-safe campaign member ICP labels (no DB). */

export type CampaignMemberIcpMatch = "strong" | "partial" | "weak" | "unknown";

export type CampaignMemberIcpRecommendedAction =
  | "keep_and_draft"
  | "keep"
  | "engage_comment"
  | "review_remove"
  | "skip";

export const ICP_MATCH_LABELS: Record<CampaignMemberIcpMatch, string> = {
  strong: "ICP strong",
  partial: "ICP partial",
  weak: "ICP weak",
  unknown: "ICP unclear",
};

export const ICP_ACTION_LABELS: Record<CampaignMemberIcpRecommendedAction, string> =
  {
    keep_and_draft: "Draft outreach",
    keep: "Keep",
    engage_comment: "Engage via comment",
    review_remove: "Review removal",
    skip: "Skip outreach",
  };

export function icpMatchBadgeClass(match: CampaignMemberIcpMatch): string {
  switch (match) {
    case "strong":
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100";
    case "partial":
      return "bg-amber-100 text-amber-950 dark:bg-amber-950/50 dark:text-amber-100";
    case "weak":
      return "bg-red-100 text-red-900 dark:bg-red-950/50 dark:text-red-100";
    default:
      return "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200";
  }
}

/** Strong or partial fit: eligible for invite note / DM drafting. */
export function icpFitForOutreachDraft(
  match: CampaignMemberIcpMatch | string | null | undefined,
): boolean {
  return match === "strong" || match === "partial";
}

/** After ICP analysis: write an invite note or follow-up DM. */
export function shouldAutoDraftOutreach(input: {
  icpMatch: string | null | undefined;
  recommendedAction?: string | null;
  isFirstDegree?: boolean;
}): boolean {
  const action = campaignIcpActionForConnectedContact(
    input.recommendedAction,
    input.icpMatch,
    Boolean(input.isFirstDegree),
  );
  if (action === "skip" || action === "review_remove" || action === "engage_comment") {
    return false;
  }
  return icpFitForOutreachDraft(input.icpMatch);
}

/**
 * 1st-degree campaign members already have a DM channel. Public comment
 * (engage_comment) is for warming 2nd/3rd before an invite.
 */
export function campaignIcpActionForConnectedContact(
  recommendedAction: string | null | undefined,
  icpMatch: string | null | undefined,
  isFirstDegree: boolean,
): CampaignMemberIcpRecommendedAction | string {
  const action = recommendedAction?.trim() || "keep";
  if (!isFirstDegree) return action;
  if (action === "skip" || action === "review_remove") return action;
  if (!icpFitForOutreachDraft(icpMatch)) return action;
  return "keep_and_draft";
}
