/** Post-send workflow helpers — client-safe, no DB imports. */

import type { MemberOutreachExtras } from "@/lib/campaignMemberOutreachShared";
import { memberNeedsMessagingReply } from "@/lib/campaignMemberMessagingShared";
import type { InboxThreadAnalysis } from "@/lib/inboxThreadAnalysisTypes";
import type { MergedMessagingThread } from "@/lib/messagingTypes";

export type CampaignMemberStatus =
  | "draft"
  | "ready"
  | "sent"
  | "skipped"
  | "closed";

export type CampaignWorkflowPhase =
  | "prep"
  | "ready_for_send"
  | "message_sent"
  | "awaiting_reply"
  | "in_conversation"
  | "ghosted"
  | "skipped"
  | "campaign_ended";

export type CampaignCloseReason =
  | "manual"
  | "ghosted"
  | "won"
  | "lost"
  | "not_fit"
  | "other";

export const WORKFLOW_PHASE_LABELS: Record<CampaignWorkflowPhase, string> = {
  prep: "Preparing outreach",
  ready_for_send: "Ready to send",
  message_sent: "Message sent",
  awaiting_reply: "Awaiting their reply",
  in_conversation: "In conversation",
  ghosted: "Ghosted — consider ending",
  skipped: "Skipped",
  campaign_ended: "Campaign ended",
};

export const CLOSE_REASON_LABELS: Record<CampaignCloseReason, string> = {
  manual: "Ended manually",
  ghosted: "Ghosted / no response",
  won: "Positive outcome",
  lost: "Not moving forward",
  not_fit: "Not a fit",
  other: "Other",
};

export type EndCampaignAdvice = {
  suggest: boolean;
  reason: string;
  suggestedCloseReason: CampaignCloseReason;
};

export function deriveMemberWorkflowPhase(input: {
  memberStatus: string;
  extras?: MemberOutreachExtras | null;
  thread?: MergedMessagingThread | null;
  threadAnalysis?: InboxThreadAnalysis | null;
}): CampaignWorkflowPhase {
  const st = input.memberStatus;
  if (st === "closed") return "campaign_ended";
  if (st === "skipped") return "skipped";
  if (st === "ready") return "ready_for_send";
  if (st === "draft") return "prep";

  if (st !== "sent") return "prep";

  const outcome = input.extras?.messageReplyOutcome ?? "unknown";
  const stage = input.threadAnalysis?.thread_stage;

  if (outcome === "ghosted" || stage === "ghosted") return "ghosted";
  if (stage === "closed") return "ghosted";

  if (
    memberNeedsMessagingReply({
      memberStatus: "sent",
      thread: input.thread ?? null,
      extras: input.extras ?? undefined,
    })
  ) {
    return "in_conversation";
  }

  if (outcome === "replied" || input.thread?.replyState.theirMessageCount) {
    return "in_conversation";
  }

  if (outcome === "no_reply") return "awaiting_reply";

  return "message_sent";
}

export function adviseEndCampaign(input: {
  memberStatus: string;
  extras?: MemberOutreachExtras | null;
  threadAnalysis?: InboxThreadAnalysis | null;
}): EndCampaignAdvice {
  if (input.memberStatus !== "sent") {
    return { suggest: false, reason: "", suggestedCloseReason: "manual" };
  }

  const analysis = input.threadAnalysis;
  const stage = analysis?.thread_stage;
  const action = analysis?.recommended_action;

  if (input.extras?.messageReplyOutcome === "ghosted" || stage === "ghosted") {
    return {
      suggest: true,
      reason:
        analysis?.action_rationale ||
        analysis?.sales_rationale ||
        "Thread looks ghosted — consider ending outreach for this contact.",
      suggestedCloseReason: "ghosted",
    };
  }

  if (stage === "closed") {
    return {
      suggest: true,
      reason:
        analysis?.sales_rationale ||
        "Thread is closed or rejected — wrap up this campaign member.",
      suggestedCloseReason: "lost",
    };
  }

  if (action === "mark_done" || action === "no_reply_needed") {
    return {
      suggest: true,
      reason:
        analysis?.action_rationale ||
        analysis?.sales_rationale ||
        "Coach suggests no further outreach on this thread.",
      suggestedCloseReason: stage === "scheduling" ? "won" : "manual",
    };
  }

  if (analysis?.strategy_verdict === "no_reply") {
    return {
      suggest: true,
      reason:
        analysis?.sales_rationale ||
        "No reply recommended — you may end the campaign for this contact.",
      suggestedCloseReason: "manual",
    };
  }

  return { suggest: false, reason: "", suggestedCloseReason: "manual" };
}

export function workflowPhaseBadgeClass(phase: CampaignWorkflowPhase): string {
  switch (phase) {
    case "campaign_ended":
      return "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100";
    case "ghosted":
      return "bg-amber-100 text-amber-950 dark:bg-amber-950/50 dark:text-amber-100";
    case "in_conversation":
      return "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-100";
    case "awaiting_reply":
      return "bg-violet-100 text-violet-900 dark:bg-violet-950/50 dark:text-violet-100";
    case "ready_for_send":
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100";
    case "skipped":
      return "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300";
    default:
      return "clin-pill text-xs";
  }
}
