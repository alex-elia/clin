import type { MemberOutreachExtras } from "@/lib/campaignMemberOutreach";
import type { EnrichedCampaignMember } from "@/lib/campaignMemberReadiness";
export { REPLY_OUTCOME_LABELS } from "@/lib/campaignMemberMessagingShared";
import {
  getMergedMessagingThreadForCampaignContact,
  type MergedMessagingThread,
} from "@/lib/messagingContext";

export type CampaignMessagingSummary = {
  sentCount: number;
  withThread: number;
  needsReply: number;
  needsCapture: number;
  markedReplied: number;
};

export type CampaignContactRef = {
  id: string;
  fullName: string | null;
  linkedinUrlCanonical: string | null;
};

/** Latest merged messaging thread per contact (parallel fetch). */
export async function loadLatestMessagingThreadsByContactId(
  contacts: CampaignContactRef[],
): Promise<Map<string, MergedMessagingThread>> {
  const map = new Map<string, MergedMessagingThread>();
  const unique = new Map<string, CampaignContactRef>();
  for (const c of contacts) {
    if (c.id) unique.set(c.id, c);
  }
  await Promise.all(
    [...unique.values()].map(async (contact) => {
      const thread = await getMergedMessagingThreadForCampaignContact(contact);
      if (thread) map.set(contact.id, thread);
    }),
  );
  return map;
}

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

export function getCampaignMessagingSummary(
  members: EnrichedCampaignMember[],
  messagingByContactId: Map<string, MergedMessagingThread>,
  outreachExtras: Map<string, MemberOutreachExtras>,
): CampaignMessagingSummary {
  let sentCount = 0;
  let withThread = 0;
  let needsReply = 0;
  let needsCapture = 0;
  let markedReplied = 0;

  for (const row of members) {
    if (row.member.status !== "sent") continue;
    sentCount += 1;
    const thread = messagingByContactId.get(row.contact.id) ?? null;
    const extras = outreachExtras.get(row.member.id);
    if (extras?.messageReplyOutcome === "replied") markedReplied += 1;
    if (thread) {
      withThread += 1;
      if (memberNeedsMessagingReply({
        memberStatus: row.member.status,
        thread,
        extras,
      })) {
        needsReply += 1;
      }
    } else {
      needsCapture += 1;
    }
  }

  return {
    sentCount,
    withThread,
    needsReply,
    needsCapture,
    markedReplied,
  };
}
