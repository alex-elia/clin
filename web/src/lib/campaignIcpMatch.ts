import { z } from "zod";
import { getDb } from "@/db";
import { contacts, outreachCampaigns } from "@/db/schema";
import { eq } from "drizzle-orm";
import { extractJsonObjectFromModelText } from "@/lib/llmAnalysis";
import { completeChat, getLlmConfigForFeature } from "@/lib/llm/completeChat";
import {
  buildContactContextBundle,
  type ContactContextBundle,
} from "@/lib/contactContextBundle";
import { formatLinkedInActivityForPrompt } from "@/lib/linkedinActivity";
import { getLatestProfileContextForOutreach } from "@/lib/profileCaptureContext";
import { getUserContextForLlm, userContextHasLlmSignal } from "@/lib/userContext";

export const campaignIcpMatchSchema = z.object({
  icp_match: z.enum(["strong", "partial", "weak", "unknown"]),
  rationale: z.string(),
  recommended_action: z.enum([
    "keep_and_draft",
    "keep",
    "engage_comment",
    "review_remove",
    "skip",
  ]),
});

export type CampaignIcpMatch = z.infer<typeof campaignIcpMatchSchema>;

function profileContextFromBundle(bundle: ContactContextBundle): string {
  const parts = [
    bundle.profile_context,
    bundle.company_intel_context,
  ].filter(Boolean);
  return parts.join("\n\n");
}

function applyActivityCapToIcpMatch(
  match: CampaignIcpMatch,
  bundle: ContactContextBundle,
  contact: { headline?: string | null },
): CampaignIcpMatch {
  const tier = bundle.activity.tier;
  if (tier !== "lurker" && tier !== "dormant") return match;

  const strongHeadline =
    typeof contact.headline === "string" &&
    contact.headline.trim().length >= 16;

  let { icp_match, recommended_action, rationale } = match;
  if (icp_match === "strong") icp_match = "partial";

  if (
    recommended_action === "engage_comment" ||
    (recommended_action === "keep_and_draft" && !strongHeadline)
  ) {
    recommended_action = icp_match === "weak" ? "skip" : "keep";
    rationale = `${rationale} LinkedIn activity tier ${tier} — limited recent posts; prefer nurture over engage/DM.`;
  }

  return { icp_match, recommended_action, rationale };
}

export async function checkContactAgainstCampaignIcp(opts: {
  campaignId: string;
  contactId: string;
  contextBundle?: ContactContextBundle;
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
  const bundle =
    opts.contextBundle ?? (await buildContactContextBundle(contact.id));
  const profileCtx =
    bundle.profile_context || bundle.company_intel_context
      ? profileContextFromBundle(bundle)
      : await getLatestProfileContextForOutreach(contact.id);
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
      LINKEDIN_ACTIVITY: formatLinkedInActivityForPrompt(bundle.activity),
      rule_activity: {
        tier: bundle.activity.tier,
        score: bundle.activity.score,
        newest_post_age_label: bundle.activity.newestPostAgeLabel,
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

  const routed = await getLlmConfigForFeature("campaign_icp_check", {
    userChars: user.length,
  });
  const raw = await completeChat({
    config: routed.config,
    feature: "campaign_icp_check",
    system: `You judge whether a LinkedIn contact fits a campaign's ICP (ideal customer profile).
Respond with JSON only:
{
  "icp_match": "strong" | "partial" | "weak" | "unknown",
  "rationale": "1-3 sentences",
  "recommended_action": "keep_and_draft" | "keep" | "engage_comment" | "review_remove" | "skip"
}
- strong: clear ICP fit, worth personalized outreach now.
- partial: plausible but missing data or timing; keep but maybe nurture.
- weak: poor fit vs ICP; skip or review_remove if clearly wrong person.
- unknown: not enough data — say what is missing in rationale.
- keep_and_draft: strong fit with enough profile to draft a DM.
- engage_comment: partial/nurture fit with a concrete recent-post hook — comment on their post first to warm the relationship; not ready for a cold DM.
When LINKEDIN_ACTIVITY tier is lurker or dormant, cap icp_match at partial and avoid engage_comment or keep_and_draft unless headline is a strong ICP signal.
When tier is unknown, do not penalize for missing posts capture.
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
  return applyActivityCapToIcpMatch(parsed.data, bundle, contact);
}
