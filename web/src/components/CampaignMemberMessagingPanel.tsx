import {
  syncMemberReplyFromThreadAction,
  updateMemberReplyOutcomeAction,
} from "@/app/actions";
import { CampaignMemberConversationPanel } from "@/components/CampaignMemberConversationPanel";
import type { MemberOutreachExtras } from "@/lib/campaignMemberOutreach";
import type { StoredThreadAnalysis } from "@/lib/inboxThreadAnalysisTypes";
import type { MergedMessagingThread } from "@/lib/messagingTypes";

type Props = {
  campaignId: string;
  memberId: string;
  contactId: string;
  contactName: string;
  memberStatus: string;
  thread: MergedMessagingThread | null;
  extras?: MemberOutreachExtras;
  storedCaptureAnalysis?: StoredThreadAnalysis | null;
  storedPastedAnalysis?: StoredThreadAnalysis | null;
  initialPastedThread?: string;
};

export function CampaignMemberMessagingPanel({
  campaignId,
  memberId,
  contactId,
  contactName,
  memberStatus,
  thread,
  extras,
  storedCaptureAnalysis,
  storedPastedAnalysis,
  initialPastedThread,
}: Props) {
  return (
    <CampaignMemberConversationPanel
      campaignId={campaignId}
      memberId={memberId}
      contactId={contactId}
      contactName={contactName}
      memberStatus={memberStatus}
      thread={thread}
      extras={extras}
      storedCaptureAnalysis={storedCaptureAnalysis}
      storedPastedAnalysis={storedPastedAnalysis}
      initialPastedThread={initialPastedThread}
      syncReplyAction={syncMemberReplyFromThreadAction}
      updateReplyOutcomeAction={updateMemberReplyOutcomeAction}
    />
  );
}
