import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { outreachCampaignMembers } from "@/db/schema";
import type { CampaignIcpMatch } from "@/lib/campaignIcpMatch";
import { checkContactAgainstCampaignIcp } from "@/lib/campaignIcpMatch";
import type {
  CampaignMemberIcpMatch,
  CampaignMemberIcpRecommendedAction,
} from "@/lib/campaignMemberIcpShared";

export type StoredMemberIcp = {
  icpMatch: CampaignMemberIcpMatch | null;
  icpRationale: string | null;
  icpRecommendedAction: CampaignMemberIcpRecommendedAction | null;
  icpCheckedAt: Date | null;
};

const VALID_MATCH = new Set<string>(["strong", "partial", "weak", "unknown"]);
const VALID_ACTION = new Set<string>([
  "keep_and_draft",
  "keep",
  "review_remove",
  "skip",
]);

export function readMemberIcpFromRow(
  member: typeof outreachCampaignMembers.$inferSelect,
): StoredMemberIcp {
  const rawMatch = member.icpMatch?.trim() ?? "";
  const icpMatch = VALID_MATCH.has(rawMatch)
    ? (rawMatch as CampaignMemberIcpMatch)
    : null;
  const rawAction = member.icpRecommendedAction?.trim() ?? "";
  const icpRecommendedAction = VALID_ACTION.has(rawAction)
    ? (rawAction as CampaignMemberIcpRecommendedAction)
    : null;
  return {
    icpMatch,
    icpRationale: member.icpRationale?.trim() || null,
    icpRecommendedAction,
    icpCheckedAt: member.icpCheckedAt ?? null,
  };
}

export async function persistMemberIcpCheck(
  memberId: string,
  check: CampaignIcpMatch,
): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db
    .update(outreachCampaignMembers)
    .set({
      icpMatch: check.icp_match,
      icpRationale: check.rationale,
      icpRecommendedAction: check.recommended_action,
      icpCheckedAt: now,
      updatedAt: now,
    })
    .where(eq(outreachCampaignMembers.id, memberId));
}

export async function runAndPersistMemberIcpCheck(opts: {
  campaignId: string;
  memberId: string;
  contactId: string;
}): Promise<CampaignIcpMatch & { checkedAt: string }> {
  const check = await checkContactAgainstCampaignIcp({
    campaignId: opts.campaignId,
    contactId: opts.contactId,
  });
  await persistMemberIcpCheck(opts.memberId, check);
  return { ...check, checkedAt: new Date().toISOString() };
}
