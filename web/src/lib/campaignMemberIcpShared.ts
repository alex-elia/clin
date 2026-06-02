/** Client-safe campaign member ICP labels (no DB). */

export type CampaignMemberIcpMatch = "strong" | "partial" | "weak" | "unknown";

export type CampaignMemberIcpRecommendedAction =
  | "keep_and_draft"
  | "keep"
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
