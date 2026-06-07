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

/** Prompt block for outreach draft LLM — no DB imports. */
export function formatContactPlaybookForDraftPrompt(
  playbook: ContactPlaybook | null,
  opts?: { icpRationale?: string | null },
): string {
  if (!playbook && !opts?.icpRationale?.trim()) return "";

  const lines: string[] = [
    "Clin contact analysis — follow closely when writing the message:",
  ];

  if (playbook) {
    lines.push(
      `- Recommended approach: ${contactNextActionLabel(playbook.action)} (${playbook.confidence} confidence)`,
    );
    const analysis =
      playbook.strategic_summary?.trim() || playbook.rationale?.trim();
    if (analysis) lines.push(`- Analysis: ${analysis}`);
    if (playbook.playbook?.trim()) {
      lines.push(`- Advice (user next step): ${playbook.playbook.trim()}`);
    }
    const topics = playbook.posts_signals?.topics?.filter(Boolean);
    if (topics?.length) {
      lines.push(`- Recent post themes: ${topics.join(", ")}`);
    }
    if (playbook.posts_signals?.engagement_hook?.trim()) {
      lines.push(
        `- Engagement hook: ${playbook.posts_signals.engagement_hook.trim()}`,
      );
    }
    if (playbook.posts_signals?.suggested_comment_angle?.trim()) {
      lines.push(
        `- Suggested public comment angle: ${playbook.posts_signals.suggested_comment_angle.trim()}`,
      );
    }
    if (playbook.company_intel_summary?.trim()) {
      lines.push(
        `- Company intel: ${playbook.company_intel_summary.trim()}`,
      );
    }

    if (playbook.action === "engage_comment") {
      lines.push(
        "- Draft instruction: User may comment on their post first. Write the follow-up LinkedIn DM (not the public comment). Reference their recent post using the themes above; align with campaign context.",
      );
    } else if (playbook.action === "message") {
      lines.push(
        "- Draft instruction: Write the connection note or DM. Open with a concrete hook from their posts or profile when captures exist — avoid generic templates.",
      );
    } else if (playbook.action === "nurture") {
      lines.push(
        "- Draft instruction: Light-touch nurture message; no hard pitch. Use one specific observation from posts or profile.",
      );
    }
  }

  if (opts?.icpRationale?.trim()) {
    lines.push(`- Campaign ICP fit: ${opts.icpRationale.trim()}`);
  }

  lines.push(
    "- Ground the message in captured profile/posts/company data. Do not contradict the analysis or advice above.",
  );

  return lines.join("\n");
}
