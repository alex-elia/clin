import { findMemberByCampaignAndContact } from "@/lib/outreachCampaigns";
import { runAndPersistMemberIcpCheck } from "@/lib/campaignMemberIcp";
import { generateOutreachDraftForMember } from "@/lib/outreachCampaignDraft";

export type CampaignPostCaptureWorkflowResult = {
  handled: boolean;
  memberId: string | null;
  icpMatch: "strong" | "partial" | "weak" | "unknown" | null;
  recommendedAction: "keep_and_draft" | "keep" | "review_remove" | "skip" | null;
  drafted: boolean;
  skippedDraftReason: string | null;
};

/**
 * After a profile capture linked to a campaign member:
 * 1) run ICP fit check
 * 2) decide if drafting should run
 * 3) generate a personalized draft when fit is strong/partial
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
      skippedDraftReason: "member_not_found",
    };
  }

  const check = await runAndPersistMemberIcpCheck({
    campaignId: opts.campaignId,
    memberId: member.id,
    contactId: opts.contactId,
  });

  const shouldDraft =
    check.icp_match === "strong" ||
    (check.icp_match === "partial" &&
      (check.recommended_action === "keep_and_draft" ||
        check.recommended_action === "keep"));

  if (!shouldDraft) {
    return {
      handled: true,
      memberId: member.id,
      icpMatch: check.icp_match,
      recommendedAction: check.recommended_action,
      drafted: false,
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
    skippedDraftReason: drafted.ok ? null : drafted.error,
  };
}

