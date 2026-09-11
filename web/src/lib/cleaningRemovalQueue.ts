import { and, asc, eq } from "drizzle-orm";
import { getDb, getSqlite } from "@/db";
import { cleaningExecQueue, contacts } from "@/db/schema";
import {
  actionRequiredGapMs,
  countCleaningExecToday,
  getCleaningExecSettings,
} from "@/lib/cleaningExecSettings";
import { completeCleaningExec } from "@/lib/cleaningExecQueue";
import { cleaningCanDisconnect } from "@/lib/cleaningNetwork";

export type RemovalQueueItem = {
  execId: string;
  contactId: string;
  fullName: string | null;
  linkedinUrl: string | null;
  rationale: string | null;
  execMode: "auto" | "manual_confirm";
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
  for (let i = 0; i < 40; i += 1) {
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
      await completeCleaningExec({
        id: row.id,
        outcome: "skipped",
        error: "contact_missing",
      });
      continue;
    }
    if (!cleaningCanDisconnect(contact.connectionDegree)) {
      await completeCleaningExec({
        id: row.id,
        outcome: "skipped",
        error: "not_1st_degree",
      });
      continue;
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
        execMode: settings.removalExecMode,
      },
      waitMs: 0,
    };
  }
  return { item: null, reason: "queue_empty" };
}
