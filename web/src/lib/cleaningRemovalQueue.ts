import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { cleaningExecQueue, contacts } from "@/db/schema";
import {
  actionRequiredGapMs,
  countCleaningExecToday,
  getCleaningExecSettings,
} from "@/lib/cleaningExecSettings";
import { getSqlite } from "@/db";

export type RemovalQueueItem = {
  execId: string;
  contactId: string;
  fullName: string | null;
  linkedinUrl: string | null;
  rationale: string | null;
};

export async function getNextRemovalItem(): Promise<
  | { item: RemovalQueueItem; waitMs: number }
  | { item: null; reason: string; waitMs?: number }
> {
  const settings = await getCleaningExecSettings();
  if (!settings.removalEnabled) {
    return { item: null, reason: "removal_disabled" };
  }

  const doneToday = await countCleaningExecToday("removal", "disconnected");
  if (doneToday >= settings.maxPerDay) {
    return { item: null, reason: "daily_cap" };
  }

  const waitMs = await actionRequiredGapMs(settings);
  const sqlite = getSqlite();
  const last = sqlite
    .prepare(
      `SELECT completed_at FROM cleaning_exec_queue
       WHERE kind = 'removal' AND completed_at IS NOT NULL
       ORDER BY completed_at DESC LIMIT 1`,
    )
    .get() as { completed_at: number } | undefined;
  if (last?.completed_at) {
    const elapsed = Date.now() - last.completed_at;
    if (elapsed < waitMs) {
      return {
        item: null,
        reason: "pace_wait",
        waitMs: waitMs - elapsed,
      };
    }
  }

  const db = getDb();
  const row = await db.query.cleaningExecQueue.findFirst({
    where: and(
      eq(cleaningExecQueue.kind, "removal"),
      eq(cleaningExecQueue.status, "pending"),
    ),
    orderBy: asc(cleaningExecQueue.createdAt),
  });
  if (!row) return { item: null, reason: "queue_empty" };

  const contact = await db.query.contacts.findFirst({
    where: eq(contacts.id, row.contactId),
  });
  if (!contact) {
    return { item: null, reason: "contact_missing" };
  }

  const payload = (row.payloadJson ?? {}) as Record<string, unknown>;
  return {
    item: {
      execId: row.id,
      contactId: row.contactId,
      fullName: contact.fullName,
      linkedinUrl: contact.linkedinUrlCanonical,
      rationale:
        typeof payload.rationale === "string" ? payload.rationale : null,
    },
    waitMs: 0,
  };
}
