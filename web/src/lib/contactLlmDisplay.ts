export type StewardshipView = {
  recommendation: "keep" | "consider_removing" | "unclear";
  rationale: string;
};

export type OutreachFitView = {
  recommendation: "reach_out" | "nurture" | "skip" | "unclear";
  rationale: string;
  icp_signals?: string[];
};

export type LlmAnalysisView = {
  tier: string | null;
  model: string | null;
  analyzedAt: string | null;
  ruleScores: { r: number; b: number; c: number } | null;
  modelScores: { r: number; b: number; c: number } | null;
  outreachFit: OutreachFitView | null;
  stewardship: StewardshipView | null;
  rationale: {
    relationship?: string;
    business?: string;
    cleanup?: string;
  } | null;
  suggestedActions: string[];
  dataGaps: string[];
  messageRead: string | null;
};

function outputFromEnvelope(env: unknown): Record<string, unknown> | null {
  if (!env || typeof env !== "object") return null;
  const root = env as Record<string, unknown>;
  const output = root.output;
  if (output && typeof output === "object") return output as Record<string, unknown>;
  return root;
}

function parseStewardship(output: Record<string, unknown>): StewardshipView | null {
  const cs = output.connection_stewardship;
  if (!cs || typeof cs !== "object") return null;
  const rec = (cs as Record<string, unknown>).recommendation;
  const rat = (cs as Record<string, unknown>).rationale;
  if (
    (rec === "keep" || rec === "consider_removing" || rec === "unclear") &&
    typeof rat === "string"
  ) {
    return { recommendation: rec, rationale: rat };
  }
  return null;
}

function parseOutreachFit(output: Record<string, unknown>): OutreachFitView | null {
  const fit = output.outreach_fit;
  if (!fit || typeof fit !== "object") return null;
  const rec = (fit as Record<string, unknown>).recommendation;
  const rat = (fit as Record<string, unknown>).rationale;
  const signals = (fit as Record<string, unknown>).icp_signals;
  if (
    (rec === "reach_out" ||
      rec === "nurture" ||
      rec === "skip" ||
      rec === "unclear") &&
    typeof rat === "string"
  ) {
    return {
      recommendation: rec,
      rationale: rat,
      icp_signals: Array.isArray(signals)
        ? signals.filter((s): s is string => typeof s === "string")
        : undefined,
    };
  }
  return null;
}

export function parseLlmAnalysisView(env: unknown): LlmAnalysisView | null {
  if (!env || typeof env !== "object") return null;
  const root = env as Record<string, unknown>;
  const output = outputFromEnvelope(env);
  if (!output) return null;

  const rationaleRaw = output.rationale;
  let rationale: LlmAnalysisView["rationale"] = null;
  if (rationaleRaw && typeof rationaleRaw === "object") {
    const r = rationaleRaw as Record<string, unknown>;
    rationale = {
      relationship:
        typeof r.relationship === "string" ? r.relationship : undefined,
      business: typeof r.business === "string" ? r.business : undefined,
      cleanup: typeof r.cleanup === "string" ? r.cleanup : undefined,
    };
  }

  const suggestedRaw = output.suggested_actions;
  const suggestedActions = Array.isArray(suggestedRaw)
    ? suggestedRaw.filter((x): x is string => typeof x === "string")
    : [];

  const gapsRaw = output.data_gaps;
  const dataGaps = Array.isArray(gapsRaw)
    ? gapsRaw.filter((x): x is string => typeof x === "string")
    : [];

  const ruleScores =
    root.rule_scores && typeof root.rule_scores === "object"
      ? (root.rule_scores as { r?: number; b?: number; c?: number })
      : null;
  const modelScores =
    output.scores && typeof output.scores === "object"
      ? (output.scores as { r?: number; b?: number; c?: number })
      : null;

  return {
    tier: typeof root.tier === "string" ? root.tier : null,
    model: typeof root.model === "string" ? root.model : null,
    analyzedAt: typeof root.at === "string" ? root.at : null,
    ruleScores:
      ruleScores &&
      typeof ruleScores.r === "number" &&
      typeof ruleScores.b === "number" &&
      typeof ruleScores.c === "number"
        ? { r: ruleScores.r, b: ruleScores.b, c: ruleScores.c }
        : null,
    modelScores:
      modelScores &&
      typeof modelScores.r === "number" &&
      typeof modelScores.b === "number" &&
      typeof modelScores.c === "number"
        ? { r: modelScores.r, b: modelScores.b, c: modelScores.c }
        : null,
    outreachFit: parseOutreachFit(output),
    stewardship: parseStewardship(output),
    rationale,
    suggestedActions,
    dataGaps,
    messageRead:
      typeof output.message_read === "string" ? output.message_read : null,
  };
}

export function pickLatestAnalysisView(
  ...sources: unknown[]
): LlmAnalysisView | null {
  for (const s of sources) {
    if (!s) continue;
    let env: unknown = s;
    if (typeof s === "string") {
      try {
        env = JSON.parse(s) as unknown;
      } catch {
        continue;
      }
    }
    const view = parseLlmAnalysisView(env);
    if (view) return view;
  }
  return null;
}

export function outreachFitHeadline(f: OutreachFitView): string {
  switch (f.recommendation) {
    case "reach_out":
      return "Reach out";
    case "nurture":
      return "Nurture later";
    case "skip":
      return "Skip for now";
    default:
      return "Unclear fit";
  }
}

export function outreachFitHint(f: OutreachFitView): string {
  switch (f.recommendation) {
    case "reach_out":
      return "Good match to your offer — consider a personalized message.";
    case "nurture":
      return "Possible fit — capture more profile data or wait for a better hook.";
    case "skip":
      return "Low priority for your current offer.";
    default:
      return "Add goals & positioning in voice setup, or capture a fuller profile.";
  }
}

export const SUGGESTED_ACTION_LABELS: Record<string, string> = {
  write: "Suggested: write a message",
  visit_profile: "Suggested: capture full profile on LinkedIn",
  stay_connected: "Suggested: keep in network, no pitch now",
  consider_removing: "Suggested: review whether to disconnect",
  none: "No specific action",
};
