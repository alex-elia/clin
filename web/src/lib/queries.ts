import { and, count, desc, eq, like, ne, or } from "drizzle-orm";
import { getDb, getSqlite, repairClinSqliteSchema } from "@/db";
import { actionQueue, captureSessions, contacts } from "@/db/schema";
import { shuffledCopy } from "@/lib/shuffle";

export type QueueWithContact = {
  queue: typeof actionQueue.$inferSelect;
  contact: typeof contacts.$inferSelect;
};

export async function getOverviewStats() {
  const db = getDb();
  const [contactTotal] = await db.select({ n: count() }).from(contacts);
  const [captureTotal] = await db.select({ n: count() }).from(captureSessions);
  const [pendingQueue] = await db
    .select({ n: count() })
    .from(actionQueue)
    .where(eq(actionQueue.status, "pending"));

  const bySegment = await db
    .select({
      segment: contacts.segment,
      n: count(),
    })
    .from(contacts)
    .groupBy(contacts.segment);

  return {
    contacts: contactTotal?.n ?? 0,
    captures: captureTotal?.n ?? 0,
    queuePending: pendingQueue?.n ?? 0,
    bySegment,
  };
}

export async function getContactById(id: string) {
  repairClinSqliteSchema(getSqlite());
  const db = getDb();
  return db.query.contacts.findFirst({
    where: eq(contacts.id, id),
  });
}

export async function listContacts(opts: {
  q?: string;
  segment?: string;
  limit?: number;
  offset?: number;
}) {
  repairClinSqliteSchema(getSqlite());
  const db = getDb();
  const q = opts.q?.trim() ?? "";
  const limit = Math.min(opts.limit ?? 50, 100);
  const offset = Math.max(0, opts.offset ?? 0);

  const filters = [];
  if (opts.segment) filters.push(eq(contacts.segment, opts.segment));
  if (q) {
    const pattern = `%${q.replace(/%/g, "\\%")}%`;
    filters.push(
      or(
        like(contacts.fullName, pattern),
        like(contacts.company, pattern),
        like(contacts.headline, pattern),
      )!,
    );
  }

  const where =
    filters.length === 0
      ? undefined
      : filters.length === 1
        ? filters[0]
        : and(...filters);

  return db.query.contacts.findMany({
    where,
    orderBy: [desc(contacts.lastUpdatedAt), desc(contacts.id)],
    limit,
    offset,
  });
}

export async function listCaptures(limit = 40) {
  const db = getDb();
  return db
    .select()
    .from(captureSessions)
    .leftJoin(contacts, eq(captureSessions.contactId, contacts.id))
    .orderBy(desc(captureSessions.capturedAt))
    .limit(Math.min(limit, 100));
}

export async function listQueuePending(shuffle: boolean) {
  const db = getDb();
  const pending = await db
    .select()
    .from(actionQueue)
    .innerJoin(contacts, eq(actionQueue.contactId, contacts.id))
    .where(
      and(
        eq(actionQueue.status, "pending"),
        ne(actionQueue.outreachDecision, "approved"),
      ),
    )
    .orderBy(desc(actionQueue.priority), desc(actionQueue.createdAt));

  const items = pending.map((r) => ({
    queue: r.action_queue,
    contact: r.contacts,
  }));

  return shuffle ? shuffledCopy(items) : items;
}

/** Decide tab: still in queue, no outreach approval yet. */
export async function listQueueDecideItems(): Promise<QueueWithContact[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(actionQueue)
    .innerJoin(contacts, eq(actionQueue.contactId, contacts.id))
    .where(
      and(
        eq(actionQueue.status, "pending"),
        eq(actionQueue.outreachDecision, "pending"),
      ),
    )
    .orderBy(desc(actionQueue.priority), desc(actionQueue.createdAt));

  return rows.map((r) => ({
    queue: r.action_queue,
    contact: r.contacts,
  }));
}

/** Ready tab: approved in app; you paste/send on LinkedIn yourself, then mark sent. */
export async function listQueueReadyOutreach(): Promise<QueueWithContact[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(actionQueue)
    .innerJoin(contacts, eq(actionQueue.contactId, contacts.id))
    .where(
      and(
        eq(actionQueue.status, "pending"),
        eq(actionQueue.outreachDecision, "approved"),
      ),
    )
    .orderBy(desc(actionQueue.priority), desc(actionQueue.createdAt));

  return rows.map((r) => ({
    queue: r.action_queue,
    contact: r.contacts,
  }));
}
