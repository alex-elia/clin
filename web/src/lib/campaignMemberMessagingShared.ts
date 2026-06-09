import type { MemberOutreachExtras } from "@/lib/campaignMemberOutreachShared";
import type { MergedMessagingThread } from "@/lib/messagingTypes";

/** Client-safe labels — no DB imports. */
export const REPLY_OUTCOME_LABELS: Record<string, string> = {
  unknown: "Unknown",
  replied: "They replied",
  no_reply: "No reply yet",
  ghosted: "Ghosted",
  not_applicable: "N/A",
};

export const REPLY_OUTCOME_VALUES = [
  "unknown",
  "replied",
  "no_reply",
  "ghosted",
  "not_applicable",
] as const;

export function inferReplyOutcomeFromThread(
  thread: MergedMessagingThread | null | undefined,
): "replied" | "no_reply" | "unknown" {
  if (!thread?.messages.length) return "unknown";
  const { lastFrom, theirMessageCount, myMessageCount } = thread.replyState;
  if (theirMessageCount === 0 && myMessageCount > 0) return "no_reply";
  if (lastFrom === "them") return "replied";
  if (lastFrom === "me" && theirMessageCount > 0) return "no_reply";
  return "unknown";
}

export function memberNeedsMessagingReply(input: {
  memberStatus: string;
  thread: MergedMessagingThread | null | undefined;
  extras?: MemberOutreachExtras;
}): boolean {
  if (input.memberStatus !== "sent") return false;
  if (input.thread?.replyState.needsReply) return true;
  if (input.extras?.messageReplyOutcome === "replied") return false;
  if (input.thread && inferReplyOutcomeFromThread(input.thread) === "replied") {
    return true;
  }
  return false;
}
