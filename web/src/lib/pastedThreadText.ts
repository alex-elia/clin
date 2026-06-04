import type { ThreadReplyState } from "@/lib/messagingTypes";

/** Thread key for analyses run on pasted (non-captured) conversation text. */
export const MANUAL_PASTE_THREAD_KEY = "manual-paste";

const SENDER_LINE =
  /^(?:me|you|moi|moi\s*:|you\s*:|j['']?\s*ai\s*:|i\s*:|sender)\s*:?\s*/i;
const THEM_LINE = /^(?:them|eux|they|contact|recipient)\s*:?\s*/i;

export function estimatePastedMessageCount(text: string): number {
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  let labeled = 0;
  for (const line of lines) {
    if (SENDER_LINE.test(line) || THEM_LINE.test(line)) labeled += 1;
  }
  if (labeled > 0) return labeled;
  return Math.max(1, Math.ceil(text.trim().length / 240));
}

/** Best-effort reply state from free-form pasted LinkedIn thread text. */
export function deriveReplyStateFromPastedText(text: string): ThreadReplyState {
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) {
    return {
      lastFrom: null,
      needsReply: false,
      lastPreview: "",
      theirMessageCount: 0,
      myMessageCount: 0,
    };
  }

  let lastFrom: "me" | "them" | "unknown" = "unknown";
  let myMessageCount = 0;
  let theirMessageCount = 0;

  for (const line of lines) {
    if (SENDER_LINE.test(line)) {
      lastFrom = "me";
      myMessageCount += 1;
    } else if (THEM_LINE.test(line)) {
      lastFrom = "them";
      theirMessageCount += 1;
    }
  }

  const lastLine = lines[lines.length - 1] ?? "";
  const preview =
    lastLine.length > 180 ? `${lastLine.slice(0, 179)}…` : lastLine;

  return {
    lastFrom,
    needsReply: lastFrom === "them",
    lastPreview: preview,
    theirMessageCount,
    myMessageCount,
  };
}
