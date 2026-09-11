import type { CoachThreadScope } from "@/lib/contentCoachThreads";
import type { CopyField } from "@/lib/copyAssistantShared";

export type LlmModelTier = "orchestrator" | "reasoning" | "visual";

export type ModelRouteDecision = {
  tier: LlmModelTier;
  reason: string;
};

const WRITE_POST_RE =
  /\b(write|draft|compose|redraft|rewrite|one-?shot|full post|from my brief|article draft|long form)\b|rédige|rédiger|écris|écrire|rédaction|depuis mon brief|corps du post|accroche et corps/i;

const LIGHT_TOUCH_RE =
  /\b(shorten|tweak|typos?|hashtag|reschedule|move to|title only|hook only|fix grammar|translate|clarify)\b|raccourcir|hashtag|replanifier|titre seul|accroche seule/i;

const PLAN_CALENDAR_RE =
  /\b(plan|calendar|schedule|week|month|horizon|pipeline|create_post|tue|thu)\b|calendrier|planif|semaine|mois|créneau/i;

const HEAVY_ANALYZE_CHARS = 20_000;

/**
 * Map a Clin LLM feature onto a settings slot (fast / reasoning / visual).
 * Never pin a vendor model ID here. When OVH retires Mistral Small, change
 * the fast slot in Settings.
 */
export function routeClinFeature(
  feature: string,
  opts?: { kind?: string; userChars?: number },
): ModelRouteDecision {
  const featureKey = feature.trim();
  const kind = opts?.kind?.trim();
  const userChars = opts?.userChars ?? 0;

  if (featureKey === "post_image_prompt") {
    return { tier: "visual", reason: "image prompt drafting" };
  }

  if (
    featureKey === "campaign_prep_plan" ||
    featureKey === "campaign_prep_suggest"
  ) {
    return { tier: "reasoning", reason: featureKey };
  }

  if (
    (featureKey === "contact_analyze" ||
      featureKey === "contact_analyze_retry" ||
      featureKey === "inbox_thread_analyze" ||
      featureKey === "inbox_thread_analyze_retry") &&
    userChars >= HEAVY_ANALYZE_CHARS
  ) {
    return { tier: "reasoning", reason: "heavy analysis context" };
  }

  if (featureKey === "outreach_draft" && kind === "invite") {
    return { tier: "orchestrator", reason: "short invite note" };
  }

  if (featureKey === "outreach_draft") {
    return { tier: "orchestrator", reason: "short outreach copy" };
  }

  return { tier: "orchestrator", reason: `${featureKey || "llm"} default` };
}

/** Pick orchestrator vs reasoning for cloud post-generation features. */
export function routeBrandCoachModel(input: {
  scope: CoachThreadScope;
  message: string;
  userBlockChars: number;
  draftChars: number;
  format?: string;
  hasActivePost: boolean;
}): ModelRouteDecision {
  const msg = input.message.trim();
  const format = (input.format ?? "feed").toLowerCase();

  if (LIGHT_TOUCH_RE.test(msg) && !WRITE_POST_RE.test(msg)) {
    return {
      tier: "orchestrator",
      reason: "light edit or scheduling",
    };
  }

  if (format === "article") {
    return { tier: "reasoning", reason: "article format" };
  }

  if (input.draftChars >= 8_000) {
    return { tier: "reasoning", reason: "large existing draft" };
  }

  if (input.userBlockChars >= 12_000) {
    return { tier: "reasoning", reason: "heavy coach context" };
  }

  if (WRITE_POST_RE.test(msg)) {
    return { tier: "reasoning", reason: "full post compose request" };
  }

  if (
    input.scope === "post" &&
    input.hasActivePost &&
    msg.length >= 80 &&
    !PLAN_CALENDAR_RE.test(msg)
  ) {
    return { tier: "reasoning", reason: "post-page coaching with substance" };
  }

  if (input.scope === "studio" && PLAN_CALENDAR_RE.test(msg) && !WRITE_POST_RE.test(msg)) {
    return { tier: "orchestrator", reason: "calendar planning" };
  }

  if (input.scope === "home" && !WRITE_POST_RE.test(msg)) {
    return { tier: "orchestrator", reason: "home advisory" };
  }

  return { tier: "orchestrator", reason: "default fast model" };
}

/** Copy assistant field routing — long post fields use reasoning when configured. */
export function routeCopyAssistantModel(field: CopyField): ModelRouteDecision {
  if (field === "post_article_body" || field === "post_body") {
    return { tier: "reasoning", reason: `copy field ${field}` };
  }
  if (field === "post_hook" || field === "content_doctrine") {
    return { tier: "orchestrator", reason: `copy field ${field}` };
  }
  return { tier: "orchestrator", reason: "copy assistant default" };
}

/** OVH visual Qwen IDs are slow at short JSON copy. Do not use them as the fast slot. */
export function isVisualClassModel(
  modelId: string | null | undefined,
  visualSlot?: string | null,
): boolean {
  const m = modelId?.trim() ?? "";
  if (!m) return false;
  const visual = visualSlot?.trim();
  if (visual && m === visual) return true;
  return /^Qwen3\.8/i.test(m);
}

export function resolveTierModelId(
  orchestratorModel: string,
  reasoningModel: string | null | undefined,
  tier: LlmModelTier,
  visualModel?: string | null,
  instructFallback?: string | null,
): { model: string; tier: LlmModelTier; autoswitched: boolean } {
  const orchestrator = orchestratorModel.trim();
  const reasoning = reasoningModel?.trim();
  const visual = visualModel?.trim();
  const fallback = instructFallback?.trim();

  if (tier === "visual" && visual && visual !== orchestrator) {
    return { model: visual, tier: "visual", autoswitched: true };
  }
  if (tier === "visual") {
    return { model: orchestrator, tier: "orchestrator", autoswitched: false };
  }

  if (tier === "reasoning" && reasoning && reasoning !== orchestrator) {
    return { model: reasoning, tier: "reasoning", autoswitched: true };
  }

  if (
    fallback &&
    fallback !== orchestrator &&
    isVisualClassModel(orchestrator, visual)
  ) {
    return { model: fallback, tier: "orchestrator", autoswitched: true };
  }

  return { model: orchestrator, tier: "orchestrator", autoswitched: false };
}
