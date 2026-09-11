import { enqueueCampaignEngage } from "@/lib/campaignEngageQueue";
import { runAndPersistMemberIcpCheck } from "@/lib/campaignMemberIcp";
import type { CampaignMemberIcpRecommendedAction } from "@/lib/campaignMemberIcpShared";
import { shouldAutoDraftOutreach } from "@/lib/campaignMemberIcpShared";
import { generateOutreachDraftForMember } from "@/lib/outreachCampaignDraft";
import { findMemberByCampaignAndContact } from "@/lib/outreachCampaigns";

export type CampaignPostCaptureWorkflowResult = {
  handled: boolean;
  memberId: string | null;
  icpMatch: "strong" | "partial" | "weak" | "unknown" | null;
  recommendedAction: CampaignMemberIcpRecommendedAction | null;
  drafted: boolean;
  engaged: boolean;
  skippedDraftReason: string | null;
};

const BLOCKED_STATUSES = new Set([
  "sent",
  "skipped",
  "closed",
  "invite_sent",
]);

/**
 * After a profile capture linked to a campaign member:
 * 1) run ICP fit check
 * 2) decide if drafting or engage queue should run
 * 3) generate a personalized draft or enqueue engage comment
 */
export async function runCampaignPostCaptureWorkflow(opts: {
  campaignId: string;
  contactId: string;
}): Promise<CampaignPostCaptureWorkflowResult> {
  const member = await findMemberByCampaignAndContact(opts.campaignId, opts.contactId);
  if (!member) {
    return {
      handled: false,
      memberId: null,
      icpMatch: null,
      recommendedAction: null,
      drafted: false,
      engaged: false,
      skippedDraftReason: "member_not_found",
    };
  }

  if (BLOCKED_STATUSES.has(member.status)) {
    return {
      handled: false,
      memberId: member.id,
      icpMatch: null,
      recommendedAction: null,
      drafted: false,
      engaged: false,
      skippedDraftReason: `member_status_${member.status}`,
    };
  }

  const check = await runAndPersistMemberIcpCheck({
    campaignId: opts.campaignId,
    memberId: member.id,
    contactId: opts.contactId,
  });

  if (check.recommended_action === "engage_comment") {
    let engaged = false;
    let skippedReason: string | null = null;
    if (member.status !== "engage") {
      const engage = await enqueueCampaignEngage({
        campaignId: opts.campaignId,
        memberId: member.id,
        contactId: opts.contactId,
      });
      engaged = engage.ok;
      skippedReason = engage.ok
        ? null
        : engage.reason === "no_recent_post"
          ? "no_recent_post"
          : engage.error;
    }
    return {
      handled: true,
      memberId: member.id,
      icpMatch: check.icp_match,
      recommendedAction: check.recommended_action,
      drafted: false,
      engaged,
      skippedDraftReason: skippedReason,
    };
  }

  const shouldDraft = shouldAutoDraftOutreach({
    icpMatch: check.icp_match,
    recommendedAction: check.recommended_action,
  });

  if (!shouldDraft) {
    return {
      handled: true,
      memberId: member.id,
      icpMatch: check.icp_match,
      recommendedAction: check.recommended_action,
      drafted: false,
      engaged: false,
      skippedDraftReason: "icp_not_fit_for_draft",
    };
  }

  const drafted = await generateOutreachDraftForMember(member.id);
  return {
    handled: true,
    memberId: member.id,
    icpMatch: check.icp_match,
    recommendedAction: check.recommended_action,
    drafted: drafted.ok,
    engaged: false,
    skippedDraftReason: drafted.ok ? null : drafted.error,
  };
}
