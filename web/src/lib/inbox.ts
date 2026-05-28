import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  captureSessions,
  contacts,
  inboxThreadState,
} from "@/db/schema";

export type InboxThreadStatus = "open" | "done" | "snoozed";

function threadKeyFromCapture(row: {
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

function previewFromJson(extractedJson: unknown, maxLen = 180): string {
  const j = extractedJson as Record<string, unknown> | null;
  const msgs = j?.messagingMessages;
  if (!Array.isArray(msgs) || msgs.length === 0) return "";
  const last = msgs[msgs.length - 1] as { body?: string } | undefined;
  const t = typeof last?.body === "string" ? last.body.trim() : "";
  if (!t) return "";
  return t.length > maxLen ? `${t.slice(0, maxLen - 1)}…` : t;
}

export type InboxOverviewRow = {
  contactId: string;
  fullName: string | null;
  linkedinUrl: string;
  threadKey: string;
  threadUrl: string;
  lastCapturedAt: Date;
  captureId: string;
  messageCount: number;
  preview: string;
  state: {
    id: string;
    status: InboxThreadStatus;
    snoozedUntil: Date | null;
    note: string | null;
  } | null;
};

export async function listInboxOverview(opts?: {
  statusFilter?: "active" | "all" | InboxThreadStatus;
  contactId?: string;
  limit?: number;
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
    .limit(Math.min(lim * 4, 800));

  const dedup = new Map<string, (typeof captures)[0]>();
  for (const row of captures) {
    if (!row.contactId) continue;
    const tk = threadKeyFromCapture({
      sourceUrl: row.sourceUrl,
      extractedJson: row.extractedJson,
    });
    const key = `${row.contactId}::${tk}`;
    if (!dedup.has(key)) dedup.set(key, row);
  }

  let rows: InboxOverviewRow[] = [...dedup.values()].map((row) => {
    const j = row.extractedJson as Record<string, unknown> | null;
    const msgs = j?.messagingMessages;
    const count = Array.isArray(msgs) ? msgs.length : 0;
    const tk = threadKeyFromCapture({
      sourceUrl: row.sourceUrl,
      extractedJson: row.extractedJson,
    });
    return {
      contactId: row.contactId!,
      fullName: null as string | null,
      linkedinUrl: "",
      threadKey: tk,
      threadUrl: row.sourceUrl,
      lastCapturedAt: row.capturedAt,
      captureId: row.id,
      messageCount: count,
      preview: previewFromJson(row.extractedJson),
      state: null,
    };
  });

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
  if (filter === "all") return rows;

  return rows.filter((r) => {
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
