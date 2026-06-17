import { safeTruncate } from "@/lib/llm/sanitizePromptText";

/** Keep coach prompts bounded — avoids OOM in Ollama / browser on long posts. */
export const COACH_LIMITS = {
  ideaNotes: 6_000,
  hook: 2_000,
  body: 8_000,
  articleBody: 10_000,
  historyMessage: 2_500,
  historyMessages: 12,
  pipelinePosts: 40,
  pipelineHook: 80,
  userMessage: 12_000,
  replyDisplay: 24_000,
  /** Chat bubble when coach-actions carry the full draft */
  replyWithActions: 1_200,
} as const;

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
