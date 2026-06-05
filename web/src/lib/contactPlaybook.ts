import type { CampaignIcpMatch } from "@/lib/campaignIcpMatch";
import type { CleaningPlanView, LlmAnalysisView } from "@/lib/contactLlmDisplay";
import { pickLatestAnalysisView } from "@/lib/contactLlmDisplay";
import type { LlmAnalysisOutput } from "@/lib/llmAnalysis";
import type { SalesMotion } from "@/lib/salesCoachPlaybook";

export type ContactNextAction =
  | "enrich_first"
  | "review_remove"
  | "engage_comment"
  | "nurture"
  | "message"
  | "hold"
  | "needs_review";

export type ContactPlaybook = {
  action: ContactNextAction;
  confidence: "low" | "medium" | "high";
  rationale: string;
  playbook: string;
  motion?: SalesMotion;
  sources: (
    | "contact_analyze"
    | "campaign_icp"
    | "posts_signals"
    | "company_intel"
  )[];
  analyzedAt: string;
  strategic_summary?: string;
  posts_signals?: {
    topics?: string[];
    hiring_or_role_change?: boolean;
    engagement_hook?: string;
    suggested_comment_angle?: string;
  };
  company_intel_summary?: string;
  campaign_overlay?: {
    campaignId: string;
    icp_match: CampaignIcpMatch["icp_match"];
    recommended_action: CampaignIcpMatch["recommended_action"];
  };
};

const BUCKET_TO_ACTION: Record<
  NonNullable<CleaningPlanView>["bucket"],
  ContactNextAction
> = {
  enrich_first: "enrich_first",
  needs_review: "needs_review",
  review_remove: "review_remove",
  reach_out_dm: "message",
  engage_comment: "engage_comment",
  nurture_light: "nurture",
  keep_passive: "hold",
};

const ACTION_LABELS: Record<ContactNextAction, string> = {
  enrich_first: "Enrich profile first",
  needs_review: "Needs review",
  review_remove: "Review for removal",
  engage_comment: "Engage via comment",
  nurture: "Nurture",
  message: "Message / outreach",
  hold: "Hold — low priority",
};

export function contactNextActionLabel(action: ContactNextAction): string {
  return ACTION_LABELS[action];
}

function parsePostsSignals(
  output: LlmAnalysisOutput | Record<string, unknown> | null | undefined,
): ContactPlaybook["posts_signals"] | undefined {
  if (!output || typeof output !== "object") return undefined;
  const ps = (output as Record<string, unknown>).posts_signals;
  if (!ps || typeof ps !== "object") return undefined;
  const p = ps as Record<string, unknown>;
  return {
    topics: Array.isArray(p.topics)
      ? p.topics.filter((t): t is string => typeof t === "string")
      : undefined,
    hiring_or_role_change:
      typeof p.hiring_or_role_change === "boolean"
        ? p.hiring_or_role_change
        : undefined,
    engagement_hook:
      typeof p.engagement_hook === "string" ? p.engagement_hook : undefined,
    suggested_comment_angle:
      typeof p.suggested_comment_angle === "string"
        ? p.suggested_comment_angle
        : undefined,
  };
}

function strategicSummary(
  output: LlmAnalysisOutput | Record<string, unknown> | null | undefined,
): string | undefined {
  if (!output || typeof output !== "object") return undefined;
  const sa = (output as Record<string, unknown>).strategic_assessment;
  if (typeof sa === "string" && sa.trim()) return sa.trim();
  if (sa && typeof sa === "object") {
    const s = (sa as Record<string, unknown>).summary;
    if (typeof s === "string" && s.trim()) return s.trim();
  }
  const fit = (output as LlmAnalysisOutput).outreach_fit;
  if (fit?.rationale) return fit.rationale;
  return undefined;
}

export function buildContactPlaybookFromAnalysis(opts: {
  analysis: LlmAnalysisView | null;
  rawOutput?: LlmAnalysisOutput | Record<string, unknown> | null;
  motion?: SalesMotion;
  companyIntelSummary?: string | null;
  campaignOverlay?: ContactPlaybook["campaign_overlay"];
}): ContactPlaybook | null {
  const plan = opts.analysis?.cleaningPlan;
  if (!plan) return null;

  let action = BUCKET_TO_ACTION[plan.bucket];
  let rationale = plan.rationale;
  const sources: ContactPlaybook["sources"] = ["contact_analyze"];
  const postsSignals = parsePostsSignals(opts.rawOutput);
  if (postsSignals) sources.push("posts_signals");
  if (opts.companyIntelSummary?.trim()) sources.push("company_intel");

  const overlay = opts.campaignOverlay;
  if (overlay) {
    sources.push("campaign_icp");
    if (
      overlay.recommended_action === "review_remove" ||
      overlay.icp_match === "weak"
    ) {
      action = "review_remove";
      rationale = overlay.icp_match
        ? `${rationale} Campaign ICP: ${overlay.icp_match}.`
        : rationale;
    } else if (
      overlay.icp_match === "strong" &&
      overlay.recommended_action === "keep_and_draft"
    ) {
      action = "message";
    } else if (overlay.icp_match === "partial") {
      if (action === "message") action = "nurture";
    }
  }

  return {
    action,
    confidence: plan.confidence,
    rationale,
    playbook:
      plan.playbook?.trim() ||
      contactNextActionLabel(action),
    motion: opts.motion,
    sources,
    analyzedAt: opts.analysis?.analyzedAt ?? new Date().toISOString(),
    strategic_summary: strategicSummary(opts.rawOutput),
    posts_signals: postsSignals,
    company_intel_summary: opts.companyIntelSummary?.trim() || undefined,
    campaign_overlay: overlay,
  };
}

export function pickContactPlaybookFromEnvelope(
  contactId: string,
  llmProvisionalJson: string | null | undefined,
  llmRefinedJson: string | null | undefined,
): ContactPlaybook | null {
  for (const raw of [llmRefinedJson, llmProvisionalJson]) {
    if (!raw?.trim()) continue;
    try {
      const env = JSON.parse(raw) as Record<string, unknown>;
      const pb = env.playbook;
      if (pb && typeof pb === "object") return pb as ContactPlaybook;
    } catch {
      /* ignore */
    }
  }
  const view = pickLatestAnalysisView(
    llmRefinedJson,
    llmProvisionalJson,
  );
  return buildContactPlaybookFromAnalysis({ analysis: view });
}

export function mergePlaybookIntoEnvelope(
  envelope: Record<string, unknown>,
  playbook: ContactPlaybook,
): Record<string, unknown> {
  return { ...envelope, playbook };
}
