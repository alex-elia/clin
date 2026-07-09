import { safeTruncate } from "@/lib/llm/sanitizePromptText";
import type { CoachAction } from "@/lib/brandCoachTypes";

/** Keep coach prompts bounded — avoids OOM in Ollama / browser on long posts. */
export const COACH_LIMITS = {
  ideaNotes: 6_000,
  hook: 2_000,
  body: 8_000,
  articleBody: 10_000,
  historyMessage: 2_500,
  historyMessages: 12,
  /** Shorter history when the active draft is already large */
  historyMessagesReduced: 6,
  pipelinePosts: 40,
  pipelineHook: 80,
  userMessage: 12_000,
  replyDisplay: 24_000,
  /** Chat bubble when coach-actions carry the full draft */
  replyWithActions: 1_200,
  /** Hard cap on the coach user prompt (context + history + message) */
  maxUserBlockChars: 28_000,
} as const;

const LARGE_DRAFT_CHARS =
  COACH_LIMITS.body + COACH_LIMITS.articleBody + COACH_LIMITS.ideaNotes;

export function draftTextLength(draft: CoachDraftFields): number {
  return (
    (draft.ideaNotes?.length ?? 0) +
    (draft.hook?.length ?? 0) +
    (draft.body?.length ?? 0) +
    (draft.articleBody?.length ?? 0)
  );
}

export function coachHistoryLimit(draftChars: number): number {
  return draftChars >= LARGE_DRAFT_CHARS * 0.5
    ? COACH_LIMITS.historyMessagesReduced
    : COACH_LIMITS.historyMessages;
}

/** Ollama KV cache scales with num_ctx — keep it close to actual prompt size. */
export function estimateOllamaNumCtx(
  systemChars: number,
  userChars: number,
): number {
  const promptTokens = Math.ceil((systemChars + userChars) / 4);
  const withMargin = Math.ceil(promptTokens * 1.15) + 2_048;
  return Math.min(8_192, Math.max(4_096, withMargin));
}

export function budgetCoachUserBlock(parts: {
  contextBlock: string;
  historyLines: string[];
  userMessage: string;
}): {
  userBlock: string;
  historyDropped: number;
  contextTrimmed: boolean;
} {
  const history = [...parts.historyLines];
  let context = parts.contextBlock;
  let historyDropped = 0;
  let contextTrimmed = false;

  const assemble = () => {
    const historySection = history.length
      ? history.join("\n\n")
      : "(new thread)";
    return `Context snapshot:\n${context}

Conversation so far:
${historySection}

USER: ${parts.userMessage}`;
  };

  while (history.length > 0 && assemble().length > COACH_LIMITS.maxUserBlockChars) {
    history.shift();
    historyDropped += 1;
  }

  while (
    assemble().length > COACH_LIMITS.maxUserBlockChars &&
    context.length > 4_000
  ) {
    context = safeTruncate(
      context,
      Math.max(4_000, context.length - 3_000),
      "… [context trimmed]",
    );
    contextTrimmed = true;
  }

  return {
    userBlock: assemble(),
    historyDropped,
    contextTrimmed,
  };
}

export function trimCoachActionPatches(actions: CoachAction[]): CoachAction[] {
  return actions.map((action) => {
    if (action.type === "update_post" && action.patch) {
      const p = action.patch;
      return {
        ...action,
        patch: {
          ...p,
          ideaNotes:
            p.ideaNotes != null
              ? truncateForCoach(p.ideaNotes, COACH_LIMITS.ideaNotes)
              : p.ideaNotes,
          hook:
            p.hook != null
              ? truncateForCoach(p.hook, COACH_LIMITS.hook)
              : p.hook,
          body:
            p.body != null
              ? truncateForCoach(p.body, COACH_LIMITS.body)
              : p.body,
          articleBody:
            p.articleBody != null
              ? truncateForCoach(p.articleBody, COACH_LIMITS.articleBody)
              : p.articleBody,
        },
      };
    }
    if (action.type === "create_post") {
      const post = action.post;
      return {
        ...action,
        post: {
          ...post,
          ideaNotes:
            post.ideaNotes != null
              ? truncateForCoach(post.ideaNotes, COACH_LIMITS.ideaNotes)
              : post.ideaNotes,
          hook:
            post.hook != null
              ? truncateForCoach(post.hook, COACH_LIMITS.hook)
              : post.hook,
          body:
            post.body != null
              ? truncateForCoach(post.body, COACH_LIMITS.body)
              : post.body,
        },
      };
    }
    return action;
  });
}

export function truncateForCoach(
  text: string | null | undefined,
  max: number,
  label?: string,
): string {
  const t = (text ?? "").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  const suffix = label ? `… [${label} truncated]` : "…";
  return safeTruncate(t, max, suffix);
}

export type CoachDraftFields = {
  title?: string;
  format?: string;
  ideaNotes?: string;
  hook?: string;
  body?: string;
  articleBody?: string;
  language?: string;
  brandLanguage?: string;
};

export function trimCoachDraft<T extends CoachDraftFields>(draft: T): T {
  return {
    ...draft,
    ideaNotes: draft.ideaNotes
      ? truncateForCoach(draft.ideaNotes, COACH_LIMITS.ideaNotes)
      : draft.ideaNotes,
    hook: draft.hook
      ? truncateForCoach(draft.hook, COACH_LIMITS.hook)
      : draft.hook,
    body: draft.body
      ? truncateForCoach(draft.body, COACH_LIMITS.body)
      : draft.body,
    articleBody: draft.articleBody
      ? truncateForCoach(draft.articleBody, COACH_LIMITS.articleBody)
      : draft.articleBody,
  };
}
