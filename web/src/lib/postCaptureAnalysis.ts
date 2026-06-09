import { getDb } from "@/db";
import {
  defaultAutopilotAnalyzeBody,
  executeContactAnalysis,
} from "@/lib/contactAnalyzeRunner";
import { runAndPersistMemberIcpCheck } from "@/lib/campaignMemberIcp";
import { generateOutreachDraftForMember } from "@/lib/outreachCampaignDraft";
import { getAutopilotSettings } from "@/lib/autopilot";
import { buildContactContextBundle } from "@/lib/contactContextBundle";
import {
  buildContactPlaybookFromAnalysis,
  mergePlaybookIntoEnvelope,
  type ContactPlaybook,
} from "@/lib/contactPlaybook";
import { pickLatestAnalysisView } from "@/lib/contactLlmDisplay";
import { selectContactLlmExtension, persistLlmAnalysis } from "@/lib/contactSqlExtras";
import { getLlmConfig } from "@/lib/llm/completeChat";
import { findMemberByCampaignAndContact } from "@/lib/outreachCampaigns";
import {
  buildSalesCoachPlaybookBlock,
  inferSalesMotion,
} from "@/lib/salesCoachPlaybook";
import { getUserContextForLlm } from "@/lib/userContext";
import { contacts, outreachCampaigns } from "@/db/schema";
import { eq } from "drizzle-orm";

export type PostCaptureAnalysisResult = {
  analyzed: boolean;
  icpChecked: boolean;
  playbook: ContactPlaybook | null;
  drafted: boolean;
};

export async function runPostCaptureAnalysis(opts: {
  contactId: string;
  campaignId?: string | null;
}): Promise<PostCaptureAnalysisResult> {
  const db = getDb();
  const settings = await getAutopilotSettings();
  const llm = await getLlmConfig();
  const bundle = await buildContactContextBundle(opts.contactId);

  const contact = await db.query.contacts.findFirst({
    where: eq(contacts.id, opts.contactId),
  });
  if (!contact) {
    throw new Error("Contact not found");
  }

  const owner = await getUserContextForLlm();
  let campaignContextText = "";
  let campaignIcpText = "";
  if (opts.campaignId) {
    const campaign = await db.query.outreachCampaigns.findFirst({
      where: eq(outreachCampaigns.id, opts.campaignId),
    });
    if (campaign) {
      campaignContextText = campaign.contextText;
      campaignIcpText =
        campaign.icpText?.trim() ||
        campaign.contextText.trim().slice(0, 2000);
    }
  }

  const motion = inferSalesMotion({
    positioningSummary: owner.positioningSummary,
    goalsText: owner.goalsText,
    campaignContextText,
    campaignIcpText,
    contactHeadline: contact.headline,
    contactCompany: contact.company,
  });

  let memberId: string | null = null;
  let drafted = false;

  if (opts.campaignId) {
    const member = await findMemberByCampaignAndContact(
      opts.campaignId,
      opts.contactId,
    );
    if (member) memberId = member.id;
  }

  const [, icpResult] = await Promise.all([
    settings.analyzeAfterProfileCapture
      ? executeContactAnalysis(
          db,
          opts.contactId,
          defaultAutopilotAnalyzeBody(),
          llm,
          {
            llmMeta: {
              motion,
              profile_depth: bundle.context_completeness.profile,
              posts_depth: bundle.context_completeness.posts,
              company_depth: bundle.context_completeness.company,
            },
            contextBundle: bundle,
            salesCoachBlock: buildSalesCoachPlaybookBlock(motion),
          },
        )
      : Promise.resolve(null),
    memberId && opts.campaignId
      ? runAndPersistMemberIcpCheck({
          campaignId: opts.campaignId,
          memberId,
          contactId: opts.contactId,
          contextBundle: bundle,
        })
      : Promise.resolve(null),
  ]);

  const llmExt = selectContactLlmExtension(opts.contactId);
  const analysisView = pickLatestAnalysisView(
    llmExt?.llmRefinedJson,
    llmExt?.llmProvisionalJson,
  );

  let rawOutput: Record<string, unknown> | null = null;
  for (const raw of [llmExt?.llmRefinedJson, llmExt?.llmProvisionalJson]) {
    if (!raw?.trim()) continue;
    try {
      const env = JSON.parse(raw) as Record<string, unknown>;
      if (env.output && typeof env.output === "object") {
        rawOutput = env.output as Record<string, unknown>;
        break;
      }
    } catch {
      /* ignore */
    }
  }

  const companySummary =
    bundle.company_intel_context.trim().length > 0
      ? bundle.company_intel_context.slice(0, 500)
      : null;

  const playbook = buildContactPlaybookFromAnalysis({
    analysis: analysisView,
    rawOutput,
    motion,
    companyIntelSummary: companySummary,
    campaignOverlay:
      opts.campaignId && icpResult
        ? {
            campaignId: opts.campaignId,
            icp_match: icpResult.icp_match,
            recommended_action: icpResult.recommended_action,
          }
        : undefined,
  });

  if (playbook && llmExt) {
    for (const [tier, raw] of [
      ["refined", llmExt.llmRefinedJson],
      ["provisional", llmExt.llmProvisionalJson],
    ] as const) {
      if (!raw?.trim()) continue;
      try {
        const env = JSON.parse(raw) as Record<string, unknown>;
        const merged = mergePlaybookIntoEnvelope(env, playbook);
        persistLlmAnalysis(
          opts.contactId,
          tier,
          JSON.stringify(merged),
          typeof env.model === "string" ? env.model : llm.model,
        );
        if (tier === "refined") break;
      } catch {
        /* ignore */
      }
    }
  }

  if (opts.campaignId && memberId && icpResult) {
    const shouldDraft =
      icpResult.icp_match === "strong" ||
      (icpResult.icp_match === "partial" &&
        (icpResult.recommended_action === "keep_and_draft" ||
          icpResult.recommended_action === "keep"));
    if (shouldDraft) {
      const draftResult = await generateOutreachDraftForMember(memberId);
      drafted = draftResult.ok;
    }
  }

  return {
    analyzed: settings.analyzeAfterProfileCapture,
    icpChecked: Boolean(icpResult),
    playbook,
    drafted,
  };
}

/**
 * Fire-and-forget when capture chain completes.
 */
export function maybeRunPostCaptureAnalysis(opts: {
  contactId: string;
  campaignId?: string | null;
}): void {
  void (async () => {
    try {
      await runPostCaptureAnalysis(opts);
    } catch (err) {
      console.error(
        "[clin] post-capture analysis failed:",
        opts.contactId,
        err,
      );
    }
  })();
}
