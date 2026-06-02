import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { outreachCampaignMembers, outreachCampaigns } from "@/db/schema";
import {
  applyAutopilotActionsForContact,
  getOutreachFitForContact,
  type AutopilotActionPolicy,
  type ContactAutopilotActionResult,
} from "@/lib/autopilotActions";
import {
  defaultAutopilotAnalyzeBody,
  executeContactAnalysis,
} from "@/lib/contactAnalyzeRunner";
import {
  enrichCampaignMembers,
  memberPipelineOpen,
  profileDepthAtLeast,
  type ProfileDepth,
} from "@/lib/campaignMemberReadiness";
import { getLlmConfig } from "@/lib/llm/completeChat";
import { listCampaignMembers } from "@/lib/outreachCampaigns";
import { selectContactLlmExtension } from "@/lib/contactSqlExtras";

export type CampaignAutopilotMode = "pending_analysis" | "reanalyze_all" | "actions_only";

export type CampaignAutopilotItemResult = {
  contactId: string;
  fullName: string | null;
  ok: boolean;
  tier?: string;
  fit?: string;
  actions?: string[];
  errors?: string[];
  analyzeError?: string;
};

function contactHasStoredAnalysis(contactId: string): boolean {
  const ext = selectContactLlmExtension(contactId);
  return Boolean(
    ext?.llmRefinedJson?.trim() || ext?.llmProvisionalJson?.trim(),
  );
}

export async function listCampaignAutopilotTargets(opts: {
  campaignId: string;
  limit: number;
  mode: CampaignAutopilotMode;
  minProfileDepth: ProfileDepth;
}): Promise<
  { contactId: string; fullName: string | null; memberId: string }[]
> {
  const rows = await listCampaignMembers(opts.campaignId);
  const enriched = await enrichCampaignMembers(rows);
  const out: { contactId: string; fullName: string | null; memberId: string }[] =
    [];

  for (const m of enriched) {
    if (!memberPipelineOpen(m)) continue;
    if (!profileDepthAtLeast(m.profileDepth, opts.minProfileDepth)) continue;

    const hasAnalysis = contactHasStoredAnalysis(m.contact.id);
    if (opts.mode === "pending_analysis" && hasAnalysis) continue;
    if (opts.mode === "actions_only" && !hasAnalysis) continue;

    out.push({
      contactId: m.contact.id,
      fullName: m.contact.fullName,
      memberId: m.member.id,
    });
    if (out.length >= opts.limit) break;
  }
  return out;
}

export async function runCampaignAutopilot(opts: {
  campaignId: string;
  limit: number;
  mode: CampaignAutopilotMode;
  minProfileDepth: ProfileDepth;
  policy: AutopilotActionPolicy;
  runActions: boolean;
  llmMeta?: Record<string, string | number | boolean | null>;
}): Promise<{
  campaignName: string;
  results: CampaignAutopilotItemResult[];
}> {
  const db = getDb();
  const campaign = await db.query.outreachCampaigns.findFirst({
    where: eq(outreachCampaigns.id, opts.campaignId),
  });
  if (!campaign) throw new Error("Campaign not found");

  const targets = await listCampaignAutopilotTargets({
    campaignId: opts.campaignId,
    limit: opts.limit,
    mode: opts.mode,
    minProfileDepth: opts.minProfileDepth,
  });

  const llm = await getLlmConfig();
  const body = defaultAutopilotAnalyzeBody();
  const results: CampaignAutopilotItemResult[] = [];

  for (const t of targets) {
    const item: CampaignAutopilotItemResult = {
      contactId: t.contactId,
      fullName: t.fullName,
      ok: true,
      actions: [],
      errors: [],
    };

    if (opts.mode !== "actions_only") {
      try {
        const { tier, envelope } = await executeContactAnalysis(
          db,
          t.contactId,
          body,
          llm,
          { llmMeta: opts.llmMeta },
        );
        item.tier = tier;
        const output = (envelope as { output?: { outreach_fit?: { recommendation?: string } } })
          .output;
        item.fit = output?.outreach_fit?.recommendation ?? "none";
      } catch (e) {
        item.ok = false;
        item.analyzeError = e instanceof Error ? e.message : String(e);
        results.push(item);
        continue;
      }
    } else {
      item.fit =
        getOutreachFitForContact(t.contactId)?.recommendation ?? "none";
    }

    if (opts.runActions && item.ok) {
      const actionRes: ContactAutopilotActionResult =
        await applyAutopilotActionsForContact({
          contactId: t.contactId,
          campaignId: opts.campaignId,
          policy: opts.policy,
        });
      item.fit = actionRes.fit;
      item.actions = actionRes.actions;
      item.errors = actionRes.errors;
      if (actionRes.errors.length) item.ok = false;
    }

    results.push(item);
  }

  return { campaignName: campaign.name, results };
}

/** Contacts with profile capture but no LLM JSON (any campaign). */
export function countCampaignMembersPendingAnalysis(
  campaignId: string,
): number {
  try {
    const db = getDb();
    const rows = db
      .select({ contactId: outreachCampaignMembers.contactId })
      .from(outreachCampaignMembers)
      .where(
        and(
          eq(outreachCampaignMembers.campaignId, campaignId),
          ne(outreachCampaignMembers.status, "sent"),
          ne(outreachCampaignMembers.status, "skipped"),
        ),
      )
      .all();
    let n = 0;
    for (const r of rows) {
      if (!contactHasStoredAnalysis(r.contactId)) n += 1;
    }
    return n;
  } catch {
    return 0;
  }
}
