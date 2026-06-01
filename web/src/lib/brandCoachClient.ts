import type { CoachAction } from "@/lib/brandCoachTypes";
import type { PostFormPatch } from "@/components/ContentPostWorkspace";

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
