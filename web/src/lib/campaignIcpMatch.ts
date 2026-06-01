import { z } from "zod";
import { getDb } from "@/db";
import { contacts, outreachCampaigns } from "@/db/schema";
import { eq } from "drizzle-orm";
import { extractJsonObjectFromModelText } from "@/lib/llmAnalysis";
import { completeChat, getLlmConfig } from "@/lib/llm/completeChat";
import { getLatestProfileContextForOutreach } from "@/lib/profileCaptureContext";
import { getUserContextForLlm, userContextHasLlmSignal } from "@/lib/userContext";

export const campaignIcpMatchSchema = z.object({
  icp_match: z.enum(["strong", "partial", "weak", "unknown"]),
  rationale: z.string(),
  recommended_action: z.enum([
    "keep_and_draft",
    "keep",
    "review_remove",
    "skip",
  ]),
});

export type CampaignIcpMatch = z.infer<typeof campaignIcpMatchSchema>;

export async function checkContactAgainstCampaignIcp(opts: {
  campaignId: string;
  contactId: string;
}): Promise<CampaignIcpMatch> {
  const db = getDb();
  const [campaign, contact] = await Promise.all([
    db.query.outreachCampaigns.findFirst({
      where: eq(outreachCampaigns.id, opts.campaignId),
    }),
    db.query.contacts.findFirst({
      where: eq(contacts.id, opts.contactId),
    }),
  ]);
  if (!campaign || !contact) {
    throw new Error("Campaign or contact not found");
  }

  const icp =
    campaign.icpText?.trim() ||
    campaign.contextText.trim().slice(0, 2000);
  const profileCtx = await getLatestProfileContextForOutreach(contact.id);
  const owner = await getUserContextForLlm();

  const user = JSON.stringify(
    {
      campaign: {
        name: campaign.name,
        icp,
        context_excerpt: campaign.contextText.slice(0, 1500),
      },
      contact: {
        fullName: contact.fullName,
        headline: contact.headline,
        company: contact.company,
        location: contact.location,
        segment: contact.segment,
        profile_context: profileCtx,
      },
      owner_context: userContextHasLlmSignal(owner)
        ? {
            goals: owner.goalsText,
            positioning: owner.positioningSummary,
          }
        : null,
    },
    null,
    2,
  );

  const llm = await getLlmConfig();
  const raw = await completeChat({
    config: llm,
    feature: "campaign_icp_check",
    system: `You judge whether a LinkedIn contact fits a campaign's ICP (ideal customer profile).
Respond with JSON only:
{
  "icp_match": "strong" | "partial" | "weak" | "unknown",
  "rationale": "1-3 sentences",
  "recommended_action": "keep_and_draft" | "keep" | "review_remove" | "skip"
}
- strong: clear ICP fit, worth personalized outreach now.
- partial: plausible but missing data or timing; keep but maybe nurture.
- weak: poor fit vs ICP; skip or review_remove if clearly wrong person.
- unknown: not enough data — say what is missing in rationale.
- keep_and_draft: strong fit with enough profile to draft a DM.
Do not invent facts.`,
    user,
    jsonMode: true,
    temperature: 0.35,
  });

  const parsed = campaignIcpMatchSchema.safeParse(
    JSON.parse(extractJsonObjectFromModelText(raw)),
  );
  if (!parsed.success) {
    throw new Error(`ICP check parse failed: ${parsed.error.message.slice(0, 200)}`);
  }
  return parsed.data;
}
