import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  captureSessions,
  contacts,
  inboxThreadState,
} from "@/db/schema";
import {
  deriveThreadReplyState,
  getMergedMessagingThreadForContact,
  mergeMessagingMessages,
  messagesFromJson,
  threadKeyFromCapture,
  type MessagingMessageRow,
  type ThreadReplyState,
} from "@/lib/messagingContext";

export type InboxThreadStatus = "open" | "done" | "snoozed";

export type InboxOverviewRow = {
  contactId: string;
  fullName: string | null;
  linkedinUrl: string;
  threadKey: string;
  threadUrl: string;
  lastCapturedAt: Date;
  captureId: string;
  messageCount: number;
  captureCount: number;
  preview: string;
  messages: MessagingMessageRow[];
  lastFrom: ThreadReplyState["lastFrom"];
  needsReply: boolean;
  state: {
    id: string;
    status: InboxThreadStatus;
    snoozedUntil: Date | null;
    note: string | null;
  } | null;
};

export type InboxThreadDetail = {
  contactId: string;
  threadKey: string;
  threadUrl: string;
  messages: MessagingMessageRow[];
  messageCount: number;
  captureCount: number;
  lastCapturedAt: Date | null;
  replyState: ThreadReplyState;
  state: InboxOverviewRow["state"];
  fullName: string | null;
  linkedinUrl: string;
};

function previewFromMessages(messages: MessagingMessageRow[], maxLen = 180): string {
  if (!messages.length) return "";
  const last = messages[messages.length - 1]!;
  const t = last.body.trim();
  if (!t) return "";
  return t.length > maxLen ? `${t.slice(0, maxLen - 1)}…` : t;
}

async function loadMergedThreadsForContact(
  contactId: string,
  captureRows: {
    id: string;
    sourceUrl: string;
    extractedJson: unknown;
    capturedAt: Date;
  }[],
): Promise<
  Map<
    string,
    {
      threadUrl: string;
      latestCaptureId: string;
      lastCapturedAt: Date;
      messages: MessagingMessageRow[];
      captureCount: number;
    }
  >
> {
  const byThread = new Map<
    string,
    {
      threadUrl: string;
      latestCaptureId: string;
      lastCapturedAt: Date;
      batches: MessagingMessageRow[][];
      captureCount: number;
    }
  >();

  for (const row of captureRows) {
    const tk = threadKeyFromCapture({
      sourceUrl: row.sourceUrl,
      extractedJson: row.extractedJson,
    });
    const msgs = messagesFromJson(row.extractedJson);
    let bucket = byThread.get(tk);
    if (!bucket) {
      bucket = {
        threadUrl: row.sourceUrl,
        latestCaptureId: row.id,
        lastCapturedAt: row.capturedAt,
        batches: [],
        captureCount: 0,
      };
      byThread.set(tk, bucket);
    }
    if (msgs.length) bucket.batches.push(msgs);
    bucket.captureCount += 1;
    if (row.capturedAt >= bucket.lastCapturedAt) {
      bucket.lastCapturedAt = row.capturedAt;
      bucket.latestCaptureId = row.id;
      bucket.threadUrl = row.sourceUrl;
    }
  }

  const out = new Map<
    string,
    {
      threadUrl: string;
      latestCaptureId: string;
      lastCapturedAt: Date;
      messages: MessagingMessageRow[];
      captureCount: number;
    }
  >();
  for (const [tk, v] of byThread) {
    out.set(tk, {
      threadUrl: v.threadUrl,
      latestCaptureId: v.latestCaptureId,
      lastCapturedAt: v.lastCapturedAt,
      messages: mergeMessagingMessages(v.batches),
      captureCount: v.captureCount,
    });
  }
  return out;
}

export async function listInboxOverview(opts?: {
  statusFilter?: "active" | "all" | InboxThreadStatus;
  contactId?: string;
  limit?: number;
  needsReplyOnly?: boolean;
}): Promise<InboxOverviewRow[]> {
  const db = getDb();
  const lim = Math.min(opts?.limit ?? 120, 400);

  const captures = await db
    .select({
      id: captureSessions.id,
      contactId: captureSessions.contactId,
      sourceUrl: captureSessions.sourceUrl,
      extractedJson: captureSessions.extractedJson,
      capturedAt: captureSessions.capturedAt,
    })
    .from(captureSessions)
    .innerJoin(contacts, eq(captureSessions.contactId, contacts.id))
    .where(
      opts?.contactId
        ? and(
            eq(captureSessions.pageType, "messaging"),
            eq(contacts.id, opts.contactId),
          )
        : eq(captureSessions.pageType, "messaging"),
    )
    .orderBy(desc(captureSessions.capturedAt))
    .limit(Math.min(lim * 8, 1200));

  const byContact = new Map<string, typeof captures>();
  for (const row of captures) {
    if (!row.contactId) continue;
    const list = byContact.get(row.contactId) ?? [];
    list.push(row);
    byContact.set(row.contactId, list);
  }

  let rows: InboxOverviewRow[] = [];
  for (const [contactId, capRows] of byContact) {
    const merged = await loadMergedThreadsForContact(contactId, capRows);
    for (const [threadKey, thread] of merged) {
      const replyState = deriveThreadReplyState(thread.messages);
      rows.push({
        contactId,
        fullName: null,
        linkedinUrl: "",
        threadKey,
        threadUrl: thread.threadUrl,
        lastCapturedAt: thread.lastCapturedAt,
        captureId: thread.latestCaptureId,
        messageCount: thread.messages.length,
        captureCount: thread.captureCount,
        preview: replyState.lastPreview || previewFromMessages(thread.messages),
        messages: thread.messages,
        lastFrom: replyState.lastFrom,
        needsReply: replyState.needsReply,
        state: null,
      });
    }
  }

  rows.sort(
    (a, b) => b.lastCapturedAt.getTime() - a.lastCapturedAt.getTime(),
  );
  rows = rows.slice(0, lim);

  if (rows.length === 0) return [];

  const contactIds = [...new Set(rows.map((r) => r.contactId))];
  const contactRows = await db.query.contacts.findMany({
    where: inArray(contacts.id, contactIds),
  });
  const cMap = new Map(contactRows.map((c) => [c.id, c]));

  const states =
    contactIds.length > 0
      ? await db.query.inboxThreadState.findMany({
          where: inArray(inboxThreadState.contactId, contactIds),
        })
      : [];
  const stateMap = new Map(
    states.map((s) => [`${s.contactId}::${s.threadKey}`, s]),
  );

  for (const r of rows) {
    const c = cMap.get(r.contactId);
    r.fullName = c?.fullName ?? null;
    r.linkedinUrl = c?.linkedinUrlCanonical ?? "";
    const st = stateMap.get(`${r.contactId}::${r.threadKey}`);
    r.state = st
      ? {
          id: st.id,
          status: st.status as InboxThreadStatus,
          snoozedUntil: st.snoozedUntil ?? null,
          note: st.note ?? null,
        }
      : null;
  }

  const now = Date.now();
  const filter = opts?.statusFilter ?? "active";
  let filtered = rows;

  if (filter !== "all") {
    filtered = rows.filter((r) => {
      const st = r.state?.status ?? "open";
      if (filter === "done") return st === "done";
      if (filter === "open") return st === "open";
      if (filter === "snoozed") return st === "snoozed";
      if (st === "done") return false;
      if (st === "snoozed" && r.state?.snoozedUntil) {
        return r.state.snoozedUntil.getTime() <= now;
      }
      if (st === "snoozed") return false;
      return true;
    });
  }

  if (opts?.needsReplyOnly) {
    filtered = filtered.filter((r) => r.needsReply);
  }

  return filtered;
}

export async function getInboxThreadDetail(input: {
  contactId: string;
  threadKey: string;
}): Promise<InboxThreadDetail | null> {
  const db = getDb();
  const contact = await db.query.contacts.findFirst({
    where: eq(contacts.id, input.contactId),
  });
  if (!contact) return null;

  const merged = await getMergedMessagingThreadForContact(input.contactId, {
    threadKey: input.threadKey,
  });
  if (!merged) return null;

  const st = await db.query.inboxThreadState.findFirst({
    where: and(
      eq(inboxThreadState.contactId, input.contactId),
      eq(inboxThreadState.threadKey, input.threadKey),
    ),
  });

  return {
    contactId: input.contactId,
    threadKey: merged.threadKey,
    threadUrl: merged.threadUrl,
    messages: merged.messages,
    messageCount: merged.messageCount,
    captureCount: merged.captureCount,
    lastCapturedAt: merged.lastCapturedAt,
    replyState: merged.replyState,
    fullName: contact.fullName,
    linkedinUrl: contact.linkedinUrlCanonical,
    state: st
      ? {
          id: st.id,
          status: st.status as InboxThreadStatus,
          snoozedUntil: st.snoozedUntil ?? null,
          note: st.note ?? null,
        }
      : null,
  };
}

export async function upsertInboxThreadState(input: {
  contactId: string;
  threadKey: string;
  status: InboxThreadStatus;
  snoozedUntil?: Date | null;
  note?: string | null;
}): Promise<void> {
  const db = getDb();
  const now = new Date();
  const existing = await db.query.inboxThreadState.findFirst({
    where: and(
      eq(inboxThreadState.contactId, input.contactId),
      eq(inboxThreadState.threadKey, input.threadKey),
    ),
  });

  const snoozed =
    input.status === "snoozed" && input.snoozedUntil
      ? input.snoozedUntil
      : input.status === "snoozed"
        ? new Date(now.getTime() + 24 * 60 * 60 * 1000)
        : null;

  if (existing) {
    await db
      .update(inboxThreadState)
      .set({
        status: input.status,
        snoozedUntil: input.status === "snoozed" ? snoozed : null,
        note:
          input.note === undefined
            ? existing.note
            : input.note?.trim()
              ? input.note.trim()
              : null,
        updatedAt: now,
      })
      .where(eq(inboxThreadState.id, existing.id));
    return;
  }

  await db.insert(inboxThreadState).values({
    id: crypto.randomUUID(),
    contactId: input.contactId,
    threadKey: input.threadKey,
    status: input.status,
    snoozedUntil: input.status === "snoozed" ? snoozed : null,
    note: input.note?.trim() || null,
    updatedAt: now,
  });
}
