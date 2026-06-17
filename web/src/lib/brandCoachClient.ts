import type { CoachAction } from "@/lib/brandCoachTypes";
import type { PostFormPatch } from "@/components/ContentPostWorkspace";
import {
  COACH_LIMITS,
  truncateForCoach,
} from "@/lib/coachContextLimits";

/** Fix wrong/missing postId when coaching a single post page. */
export function coercePostCoachActions(
  actions: CoachAction[],
  postId: string | undefined,
): CoachAction[] {
  if (!postId) return actions;
  return actions.map((action) => {
    if (action.type !== "update_post") return action;
    if (action.postId === postId) return action;
    return { ...action, postId };
  });
}

/** Avoid duplicating a full article in chat + JSON (prevents tab OOM). */
export function summarizeCoachReplyForChat(
  reply: string,
  actions: CoachAction[],
): string {
  const hasDraftPatch = actions.some(
    (a) =>
      a.type === "update_post" &&
      Boolean(
        a.patch?.body?.trim() ||
          a.patch?.articleBody?.trim() ||
          a.patch?.hook?.trim(),
      ),
  );
  if (!hasDraftPatch) {
    return truncateForCoach(reply, COACH_LIMITS.replyDisplay);
  }
  const trimmed = reply.trim();
  if (!trimmed) {
    return "Draft ready — use Apply to save, or review the form below.";
  }
  if (trimmed.length <= COACH_LIMITS.replyWithActions) return trimmed;
  const preview = truncateForCoach(
    trimmed,
    COACH_LIMITS.replyWithActions - 80,
    "preview",
  );
  return `${preview}\n\n— Full draft is in the form fields below. Click **Apply** to save it.`;
}

export function patchFromCoachAction(action: CoachAction): PostFormPatch | null {
  if (action.type !== "update_post" || !action.patch) return null;
  const p = action.patch;
  const patch: PostFormPatch = {};
  if (p.title !== undefined) patch.title = p.title;
  if (p.status !== undefined) patch.status = p.status;
  if (p.format !== undefined) patch.format = p.format;
  if (p.ideaNotes !== undefined) patch.ideaNotes = p.ideaNotes ?? "";
  if (p.hook !== undefined) patch.hook = p.hook ?? "";
  if (p.body !== undefined) patch.body = p.body ?? "";
  if (p.articleBody !== undefined) patch.articleBody = p.articleBody ?? "";
  if (p.language !== undefined) patch.language = p.language ?? "auto";
  if (p.scheduledAt !== undefined) {
    if (!p.scheduledAt) {
      patch.scheduledAt = "";
    } else {
      const d = new Date(p.scheduledAt);
      if (!Number.isNaN(d.getTime())) {
        patch.scheduledAt = new Date(
          d.getTime() - d.getTimezoneOffset() * 60_000,
        )
          .toISOString()
          .slice(0, 16);
      }
    }
  }
  return patch;
}

export function mergeDraftFromCoachActions(
  draft: Record<string, string | undefined>,
  actions: CoachAction[],
  postId: string,
): Record<string, string | undefined> {
  const next = { ...draft };
  for (const action of actions) {
    if (action.type !== "update_post" || action.postId !== postId || !action.patch) {
      continue;
    }
    const p = action.patch;
    if (p.title !== undefined) next.title = p.title;
    if (p.format !== undefined) next.format = p.format;
    if (p.ideaNotes !== undefined) next.ideaNotes = p.ideaNotes ?? "";
    if (p.hook !== undefined) next.hook = p.hook ?? "";
    if (p.body !== undefined) next.body = p.body ?? "";
    if (p.articleBody !== undefined) next.articleBody = p.articleBody ?? "";
    if (p.language !== undefined) next.language = p.language ?? "auto";
  }
  return next;
}

export function applyCoachPatchesToForm(
  actions: CoachAction[],
  postId: string,
  onApplyPatch: (patch: PostFormPatch) => void,
): number {
  let n = 0;
  for (const action of actions) {
    const patch = patchFromCoachAction(action);
    if (
      patch &&
      action.type === "update_post" &&
      action.postId === postId
    ) {
      onApplyPatch(patch);
      n += 1;
    }
  }
  return n;
}
