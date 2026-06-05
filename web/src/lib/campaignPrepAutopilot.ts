import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { contacts, outreachCampaignMembers, outreachCampaigns } from "@/db/schema";
import { checkContactAgainstCampaignIcp } from "@/lib/campaignIcpMatch";
import { persistMemberIcpCheck } from "@/lib/campaignMemberIcp";
import { runCampaignAutopilot, type CampaignAutopilotItemResult } from "@/lib/campaignAutopilot";
import type { AutopilotActionPolicy } from "@/lib/autopilotActions";
import { extractJsonObjectFromModelText } from "@/lib/llmAnalysis";
import { completeChat, getLlmConfig } from "@/lib/llm/completeChat";
import { getUserContextForLlm, userContextHasLlmSignal } from "@/lib/userContext";
import {
  addContactsToCampaign,
  listCampaignMembers,
  updateOutreachCampaign,
} from "@/lib/outreachCampaigns";
import { enrichCampaignMembers } from "@/lib/campaignMemberReadiness";
import {
  CAMPAIGN_PREP_MIN_BRIEF_CHARS,
  type CampaignPlanFromBrief,
  type ContactSuggestion,
} from "@/lib/campaignPrepAutopilotShared";

export {
  CAMPAIGN_PREP_MIN_BRIEF_CHARS,
  type CampaignPlanFromBrief,
  type ContactSuggestion,
} from "@/lib/campaignPrepAutopilotShared";

const planSchema = z.object({
  name: z.string().min(1).max(200),
  contextText: z.string().min(20).max(12_000),
  icpText: z.string().min(10).max(4000),
  writerInstructions: z.string().max(4000).optional(),
});

const suggestSchema = z.object({
  suggestions: z
    .array(
      z.object({
        contactId: z.string().min(8),
        fit: z.enum(["strong", "partial", "weak"]),
        rationale: z.string(),
      }),
    )
    .max(12),
});

export type CampaignPrepAutopilotResult = {
  ok: true;
  plan: CampaignPlanFromBrief;
  appliedFields: boolean;
  suggestions: ContactSuggestion[];
  addedContactIds: string[];
  membersIcpVerified: number;
  pipeline?: {
    campaignName: string;
    results: CampaignAutopilotItemResult[];
  };
};

async function planCampaignFromBrief(
  brief: string,
  existing: typeof outreachCampaigns.$inferSelect,
): Promise<CampaignPlanFromBrief> {
  const owner = await getUserContextForLlm();
  const llm = await getLlmConfig();
  const raw = await completeChat({
    config: llm,
    feature: "campaign_prep_plan",
    system: `You prepare a LinkedIn outreach campaign for Clin (local CRM).
From the user's short brief (voice or text), output JSON only:
{
  "name": "short campaign title",
  "contextText": "2-4 paragraphs: offer, why now, proof, CTA framing for DMs",
  "icpText": "bullet-style ICP: roles, industries, company size, geos, disqualifiers",
  "writerInstructions": "optional tone/length rules for DMs"
}
- icpText must be concrete enough to judge contacts (titles, sectors, exclusions).
- contextText is what the writer model sees per contact; icpText is for fit scoring.
- If existing campaign fields are provided, improve them rather than starting from scratch unless the brief clearly replaces everything.`,
    user: JSON.stringify(
      {
        user_brief: brief,
        existing: {
          name: existing.name,
          contextText: existing.contextText,
          icpText: existing.icpText,
          writerInstructions: existing.writerInstructions,
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
    ),
    jsonMode: true,
    temperature: 0.5,
  });

  const parsed = planSchema.safeParse(
    JSON.parse(extractJsonObjectFromModelText(raw)),
  );
  if (!parsed.success) {
    throw new Error(
      `Campaign plan parse failed: ${parsed.error.message.slice(0, 240)}`,
    );
  }
  return parsed.data;
}

async function loadContactCandidates(campaignId: string, limit: number) {
  const db = getDb();
  const memberRows = await db
    .select({ contactId: outreachCampaignMembers.contactId })
    .from(outreachCampaignMembers)
    .where(eq(outreachCampaignMembers.campaignId, campaignId));
  const memberIds = memberRows.map((r) => r.contactId);

  const rows = await db
    .select()
    .from(contacts)
    .orderBy(desc(contacts.businessScore), desc(contacts.lastUpdatedAt))
    .limit(Math.min(200, limit + memberIds.length + 20));

  const memberSet = new Set(memberIds);
  return rows
    .filter((c) => !memberSet.has(c.id))
    .slice(0, limit)
    .map((c) => ({
      contactId: c.id,
      fullName: c.fullName,
      headline: c.headline,
      company: c.company,
      segment: c.segment,
      businessScore: c.businessScore,
    }));
}

async function suggestContactsForCampaign(opts: {
  campaignId: string;
  icpText: string;
  contextText: string;
  limit: number;
}): Promise<ContactSuggestion[]> {
  const candidates = await loadContactCandidates(opts.campaignId, 50);
  if (candidates.length === 0) return [];

  const llm = await getLlmConfig();
  const raw = await completeChat({
    config: llm,
    feature: "campaign_prep_suggest",
    system: `Pick contacts from the provided list who fit the campaign ICP.
JSON only:
{ "suggestions": [{ "contactId": "uuid", "fit": "strong"|"partial"|"weak", "rationale": "short" }] }
Return at most ${opts.limit} entries. Only use contactIds from the list. Prefer strong fits with clear headline/company alignment.`,
    user: JSON.stringify(
      {
        icp: opts.icpText,
        campaign_context: opts.contextText.slice(0, 2000),
        candidates,
      },
      null,
      2,
    ),
    jsonMode: true,
    temperature: 0.35,
  });

  const parsed = suggestSchema.safeParse(
    JSON.parse(extractJsonObjectFromModelText(raw)),
  );
  if (!parsed.success) return [];

  const byId = new Map(candidates.map((c) => [c.contactId, c]));
  const out: ContactSuggestion[] = [];
  for (const s of parsed.data.suggestions) {
    const c = byId.get(s.contactId);
    if (!c) continue;
    out.push({
      contactId: s.contactId,
      fullName: c.fullName,
      headline: c.headline,
      company: c.company,
      fit: s.fit,
      rationale: s.rationale,
    });
    if (out.length >= opts.limit) break;
  }
  return out;
}

export async function runCampaignPrepAutopilot(opts: {
  campaignId: string;
  brief: string;
  applyFields: boolean;
  suggestFromDatabase: boolean;
  suggestLimit: number;
  addSuggestedContactIds: string[];
  verifyMembers: boolean;
  memberVerifyLimit: number;
  runPipeline: boolean;
  pipelineLimit: number;
  policy: AutopilotActionPolicy;
}): Promise<CampaignPrepAutopilotResult> {
  const brief = opts.brief.trim();
  if (brief.length < CAMPAIGN_PREP_MIN_BRIEF_CHARS) {
    throw new Error(
      `Brief too short — add at least ${CAMPAIGN_PREP_MIN_BRIEF_CHARS} characters.`,
    );
  }

  const db = getDb();
  const campaign = await db.query.outreachCampaigns.findFirst({
    where: eq(outreachCampaigns.id, opts.campaignId),
  });
  if (!campaign) throw new Error("Campaign not found");

  const plan = await planCampaignFromBrief(brief, campaign);

  if (opts.applyFields) {
    await updateOutreachCampaign(opts.campaignId, {
      name: plan.name,
      contextText: plan.contextText,
      icpText: plan.icpText,
      writerInstructions: plan.writerInstructions?.trim() || null,
    });
  }

  const icpForChecks = plan.icpText;
  const contextForSuggest = plan.contextText;

  let suggestions: ContactSuggestion[] = [];
  if (opts.suggestFromDatabase) {
    suggestions = await suggestContactsForCampaign({
      campaignId: opts.campaignId,
      icpText: icpForChecks,
      contextText: contextForSuggest,
      limit: opts.suggestLimit,
    });
  }

  const toAdd = opts.addSuggestedContactIds.filter((id) =>
    suggestions.some((s) => s.contactId === id),
  );
  let addedContactIds: string[] = [];
  if (toAdd.length > 0) {
    const { added } = await addContactsToCampaign(opts.campaignId, toAdd);
    if (added > 0) {
      addedContactIds = toAdd;
    }
  }

  let membersIcpVerified = 0;
  if (opts.verifyMembers) {
    const rows = await listCampaignMembers(opts.campaignId);
    const enriched = await enrichCampaignMembers(rows);
    let n = 0;
    for (const m of enriched) {
      if (n >= opts.memberVerifyLimit) break;
      if (
        m.member.status === "sent" ||
        m.member.status === "skipped" ||
        m.member.status === "closed"
      ) {
        continue;
      }
      try {
        const check = await checkContactAgainstCampaignIcp({
          campaignId: opts.campaignId,
          contactId: m.contact.id,
        });
        await persistMemberIcpCheck(m.member.id, check);
        membersIcpVerified += 1;
        n += 1;
      } catch {
        n += 1;
      }
    }
  }

  let pipeline: CampaignPrepAutopilotResult["pipeline"];
  if (opts.runPipeline) {
    pipeline = await runCampaignAutopilot({
      campaignId: opts.campaignId,
      limit: opts.pipelineLimit,
      mode: "pending_analysis",
      minProfileDepth: "thin",
      policy: opts.policy,
      runActions: true,
    });
  }

  return {
    ok: true,
    plan,
    appliedFields: opts.applyFields,
    suggestions,
    addedContactIds,
    membersIcpVerified,
    pipeline,
  };
}
