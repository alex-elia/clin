import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { cleaningExecQueue, contacts } from "@/db/schema";
import { completeCleaningExec } from "@/lib/cleaningExecQueue";
import {
  getCleaningExecSettings,
  logCleaningExecAction,
  rollActionGapAfterSuccess,
} from "@/lib/cleaningExecSettings";
import { tryUpdateCleaningDismissedAt } from "@/lib/cleaningSqlExtras";
import { setContactSegment } from "@/lib/autopilotActions";

export type RemovalAckOutcome = "disconnected" | "skipped" | "failed";

export async function acknowledgeRemovalExec(
  execId: string,
  outcome: RemovalAckOutcome,
  error?: string | null,
): Promise<{ contactId: string }> {
  const db = getDb();
  const row = await db.query.cleaningExecQueue.findFirst({
    where: eq(cleaningExecQueue.id, execId),
  });
  if (!row) throw new Error("Queue item not found.");
  if (row.kind !== "removal") throw new Error("Not a removal queue item.");

  await completeCleaningExec({ id: execId, outcome, error: error ?? null });

  if (outcome === "disconnected") {
    await setContactSegment(row.contactId, "ghost");
    tryUpdateCleaningDismissedAt(row.contactId, true);
    const settings = await getCleaningExecSettings();
    await rollActionGapAfterSuccess(settings);
  }

  await logCleaningExecAction({
    contactId: row.contactId,
    kind: "removal",
    outcome,
    error: error ?? null,
  });

  await db
    .update(contacts)
    .set({ lastUpdatedAt: new Date() })
    .where(eq(contacts.id, row.contactId));

  return { contactId: row.contactId };
}

/** Mark a contact as disconnected on LinkedIn (with or without a pending exec item). */
export async function confirmContactDisconnected(
  contactId: string,
): Promise<void> {
  const db = getDb();
  const pending = await db.query.cleaningExecQueue.findFirst({
    where: and(
      eq(cleaningExecQueue.contactId, contactId),
      eq(cleaningExecQueue.kind, "removal"),
      eq(cleaningExecQueue.status, "pending"),
    ),
  });

  if (pending) {
    await acknowledgeRemovalExec(pending.id, "disconnected");
    return;
  }

  await setContactSegment(contactId, "ghost");
  tryUpdateCleaningDismissedAt(contactId, true);
  await logCleaningExecAction({
    contactId,
    kind: "removal",
    outcome: "disconnected",
    error: null,
  });
  await db
    .update(contacts)
    .set({ lastUpdatedAt: new Date() })
    .where(eq(contacts.id, contactId));
}
