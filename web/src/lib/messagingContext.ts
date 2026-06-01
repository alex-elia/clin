import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { captureSessions } from "@/db/schema";

export type MessagingMessageRow = {
  from: "me" | "them" | "unknown";
  body: string;
};

function messagesFromJson(json: unknown): MessagingMessageRow[] {
  if (!json || typeof json !== "object") return [];
  const o = json as Record<string, unknown>;
  const src =
    o.messagingMessages ??
    (o.extractedFields && typeof o.extractedFields === "object"
      ? (o.extractedFields as Record<string, unknown>).messagingMessages
      : undefined);
  if (!Array.isArray(src)) return [];
  const out: MessagingMessageRow[] = [];
  for (const m of src) {
    if (!m || typeof m !== "object") continue;
    const row = m as Record<string, unknown>;
    const body = typeof row.body === "string" ? row.body.trim() : "";
    if (!body) continue;
    const from =
      row.from === "me" || row.from === "them" || row.from === "unknown"
        ? row.from
        : "unknown";
    out.push({ from, body });
  }
  return out;
}

/** Format captured thread for LLM message_context / contact panel. */
export function formatMessagingMessagesForContext(
  messages: MessagingMessageRow[],
  maxChars = 28_000,
): string {
  if (!messages.length) return "";
  const lines = messages.map((m) => {
    const who =
      m.from === "me" ? "Me" : m.from === "them" ? "Them" : "Unknown";
    return `${who}: ${m.body}`;
  });
  let text = lines.join("\n");
  if (text.length > maxChars) {
    const tail = text.slice(-maxChars);
    text = `…(truncated)\n${tail}`;
  }
  return text;
}

/** Latest messaging capture for a contact (extension Capture → Messaging). */
export async function getLatestMessagingCaptureForContact(
  contactId: string,
): Promise<{
  capturedAt: Date;
  messageCount: number;
  text: string;
} | null> {
  const db = getDb();
  const row = await db.query.captureSessions.findFirst({
    where: and(
      eq(captureSessions.contactId, contactId),
      eq(captureSessions.pageType, "messaging"),
    ),
    orderBy: [desc(captureSessions.capturedAt)],
  });
  if (!row?.extractedJson) return null;

  const messages = messagesFromJson(row.extractedJson);
  if (!messages.length) return null;

  const text = formatMessagingMessagesForContext(messages);
  if (!text.trim()) return null;

  return {
    capturedAt: row.capturedAt,
    messageCount: messages.length,
    text,
  };
}

/** Pasted thread wins; else stored llm field; else latest messaging capture. */
export function resolveMessageContextForAnalysis(
  pastedOrStored: string | null | undefined,
  fromCapture: string | null | undefined,
): string | null {
  const pasted = pastedOrStored?.trim();
  if (pasted && pasted.length > 0) return pasted;
  const captured = fromCapture?.trim();
  if (captured && captured.length > 0) return captured;
  return null;
}
