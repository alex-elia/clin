/** Client-safe coach / autopilot debug shapes for UI. */

export type CoachActionsParseDebug = {
  hasCoachActionsBlock: boolean;
  jsonExtracted: boolean;
  schemaValid: boolean;
  schemaError: string | null;
  actionsCount: number;
  rawLength: number;
  rawTailPreview: string;
};

export type BrandCoachTurnDebug = {
  llmLogId?: string;
  provider: string;
  model: string;
  replyPreview: string;
  parse: CoachActionsParseDebug;
};

/** Valid coach-actions block but zero actions — often OK in planning chat. */
export function isAdvisoryCoachReply(debug?: BrandCoachTurnDebug | null): boolean {
  if (!debug) return false;
  const p = debug.parse;
  return (
    p.hasCoachActionsBlock &&
    p.schemaValid &&
    p.actionsCount === 0
  );
}

export function formatCoachNoActionsMessage(debug?: BrandCoachTurnDebug | null): string {
  if (!debug) {
    return "Coach returned no post updates. Try adding more detail to your brief. See Settings → AI call logs.";
  }
  const parts: string[] = [
    "Coach returned no post updates.",
  ];
  const p = debug.parse;
  if (!p.hasCoachActionsBlock) {
    parts.push("The model reply did not include a ```coach-actions JSON block.");
  } else if (!p.jsonExtracted) {
    parts.push("Found ```coach-actions but could not extract JSON.");
  } else if (!p.schemaValid) {
    parts.push(
      `Actions JSON failed validation${p.schemaError ? `: ${p.schemaError}` : "."}`,
    );
  } else if (p.actionsCount === 0) {
    parts.push("Actions array was empty.");
  }
  parts.push(`Open Settings → AI call logs (model: ${debug.model}).`);
  return parts.join(" ");
}
