import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { captureSessions } from "@/db/schema";

export type MessagingMessageRow = {
  from: "me" | "them" | "unknown";
  body: string;
};

export type ThreadReplyState = {
  lastFrom: "me" | "them" | "unknown" | null;
  needsReply: boolean;
  lastPreview: string;
  theirMessageCount: number;
  myMessageCount: number;
};

export type MergedMessagingThread = {
  contactId: string;
  threadKey: string;
  threadUrl: string;
  messages: MessagingMessageRow[];
  messageCount: number;
  text: string;
  firstCapturedAt: Date | null;
  lastCapturedAt: Date | null;
  captureCount: number;
  replyState: ThreadReplyState;
};

export function threadKeyFromCapture(row: {
  sourceUrl: string;
  extractedJson: unknown;
}): string {
  const j = row.extractedJson as Record<string, unknown> | null;
  const id = j?.messagingThreadId;
  if (typeof id === "string" && id.trim()) return id.trim();
  try {
    const u = new URL(row.sourceUrl);
    const m = u.pathname.match(/\/messaging\/thread\/([^/?#]+)/i);
    if (m?.[1]) return decodeURIComponent(m[1]);
  } catch {
    /* ignore */
  }
  return row.sourceUrl.replace(/\/+$/, "");
}

export function messagesFromJson(json: unknown): MessagingMessageRow[] {
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

/** Dedupe and preserve order when merging multiple capture batches. */
export function mergeMessagingMessages(
  batches: MessagingMessageRow[][],
): MessagingMessageRow[] {
  const merged: MessagingMessageRow[] = [];
  const seen = new Set<string>();
  for (const batch of batches) {
    for (const m of batch) {
      const key = `${m.from}:${m.body.slice(0, 160)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(m);
    }
  }
  return merged;
}

export function deriveThreadReplyState(
  messages: MessagingMessageRow[],
): ThreadReplyState {
  if (!messages.length) {
    return {
      lastFrom: null,
      needsReply: false,
      lastPreview: "",
      theirMessageCount: 0,
      myMessageCount: 0,
    };
  }
  const last = messages[messages.length - 1]!;
  const theirMessageCount = messages.filter((m) => m.from === "them").length;
  const myMessageCount = messages.filter((m) => m.from === "me").length;
  const preview =
    last.body.length > 180 ? `${last.body.slice(0, 179)}…` : last.body;
  return {
    lastFrom: last.from,
    needsReply: last.from === "them",
    lastPreview: preview,
    theirMessageCount,
    myMessageCount,
  };
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

/** Merge all messaging captures for a contact (optionally one thread). */
export async function getMergedMessagingThreadForContact(
  contactId: string,
  opts?: { threadKey?: string; maxCaptures?: number },
): Promise<MergedMessagingThread | null> {
  const db = getDb();
  const lim = Math.min(opts?.maxCaptures ?? 24, 60);
  const rows = await db
    .select({
      id: captureSessions.id,
      sourceUrl: captureSessions.sourceUrl,
      extractedJson: captureSessions.extractedJson,
      capturedAt: captureSessions.capturedAt,
    })
    .from(captureSessions)
    .where(
      and(
        eq(captureSessions.contactId, contactId),
        eq(captureSessions.pageType, "messaging"),
      ),
    )
    .orderBy(asc(captureSessions.capturedAt))
    .limit(lim);

  if (!rows.length) return null;

  const threadKeyFilter = opts?.threadKey?.trim();
  const byThread = new Map<
    string,
    {
      threadUrl: string;
      batches: MessagingMessageRow[][];
      captureCount: number;
      firstCapturedAt: Date | null;
      lastCapturedAt: Date | null;
    }
  >();

  for (const row of rows) {
    const tk = threadKeyFromCapture({
      sourceUrl: row.sourceUrl,
      extractedJson: row.extractedJson,
    });
    if (threadKeyFilter && tk !== threadKeyFilter) continue;
    const msgs = messagesFromJson(row.extractedJson);
    if (!msgs.length) continue;

    let bucket = byThread.get(tk);
    if (!bucket) {
      bucket = {
        threadUrl: row.sourceUrl,
        batches: [],
        captureCount: 0,
        firstCapturedAt: row.capturedAt,
        lastCapturedAt: row.capturedAt,
      };
      byThread.set(tk, bucket);
    }
    bucket.batches.push(msgs);
    bucket.captureCount += 1;
    bucket.lastCapturedAt = row.capturedAt;
    if (!bucket.firstCapturedAt) bucket.firstCapturedAt = row.capturedAt;
  }

  if (!byThread.size) return null;

  let pickKey = threadKeyFilter;
  if (!pickKey) {
    let bestAt = 0;
    for (const [tk, v] of byThread) {
      const at = v.lastCapturedAt?.getTime() ?? 0;
      if (at >= bestAt) {
        bestAt = at;
        pickKey = tk;
      }
    }
  }
  if (!pickKey) return null;

  const picked = byThread.get(pickKey);
  if (!picked) return null;

  const messages = mergeMessagingMessages(picked.batches);
  if (!messages.length) return null;

  const text = formatMessagingMessagesForContext(messages);
  return {
    contactId,
    threadKey: pickKey,
    threadUrl: picked.threadUrl,
    messages,
    messageCount: messages.length,
    text,
    firstCapturedAt: picked.firstCapturedAt,
    lastCapturedAt: picked.lastCapturedAt,
    captureCount: picked.captureCount,
    replyState: deriveThreadReplyState(messages),
  };
}

/** Latest messaging capture for a contact (extension Capture → Messaging). */
export async function getLatestMessagingCaptureForContact(
  contactId: string,
): Promise<{
  capturedAt: Date;
  messageCount: number;
  text: string;
  threadKey: string | null;
  replyState: ThreadReplyState;
} | null> {
  const merged = await getMergedMessagingThreadForContact(contactId);
  if (!merged?.text.trim()) return null;

  return {
    capturedAt: merged.lastCapturedAt ?? new Date(),
    messageCount: merged.messageCount,
    text: merged.text,
    threadKey: merged.threadKey,
    replyState: merged.replyState,
  };
}

/** Pasted thread wins; else stored llm field; else merged messaging capture. */
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
