import type { CoachThreadScope } from "@/lib/contentCoachThreads";
import type { CopyField } from "@/lib/copyAssistantShared";

export type LlmModelTier = "orchestrator" | "reasoning";

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

export function resolveTierModelId(
  orchestratorModel: string,
  reasoningModel: string | null | undefined,
  tier: LlmModelTier,
): { model: string; tier: LlmModelTier; autoswitched: boolean } {
  const reasoning = reasoningModel?.trim();
  if (
    tier === "reasoning" &&
    reasoning &&
    reasoning !== orchestratorModel.trim()
  ) {
    return { model: reasoning, tier: "reasoning", autoswitched: true };
  }
  return { model: orchestratorModel, tier: "orchestrator", autoswitched: false };
}
