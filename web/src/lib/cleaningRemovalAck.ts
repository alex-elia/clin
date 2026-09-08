import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { cleaningExecQueue, contacts } from "@/db/schema";
import { DISCONNECTED_DEGREE } from "@/lib/connectionDegree";
import { completeCleaningExec } from "@/lib/cleaningExecQueue";
import {
  getCleaningExecSettings,
  logCleaningExecAction,
  rollActionGapAfterSuccess,
} from "@/lib/cleaningExecSettings";
import {
  tryUpdateCleaningDismissedAt,
  tryUpdateCleaningUserBucket,
} from "@/lib/cleaningSqlExtras";
import { invalidateNetworkHygieneSnapshot } from "@/lib/networkHygienePipeline";

export type RemovalAckOutcome = "disconnected" | "skipped" | "failed";

async function logRemovalOutcome(
  contactId: string,
  outcome: RemovalAckOutcome,
  error?: string | null,
): Promise<void> {
  try {
    await logCleaningExecAction({
      contactId,
      kind: "removal",
      outcome,
      error: error ?? null,
    });
  } catch {
    /* automation_log optional on older DBs */
  }
}

/** Persist LinkedIn disconnect in Clin (segment, degree, cleaning state). */
export async function applyContactDisconnectedState(
  contactId: string,
): Promise<void> {
  const db = getDb();
  const existing = await db.query.contacts.findFirst({
    where: eq(contacts.id, contactId),
    columns: { id: true },
  });
  if (!existing) throw new Error("Contact not found.");

  await db
    .update(contacts)
    .set({
      segment: "ghost",
      connectionDegree: DISCONNECTED_DEGREE,
      lastUpdatedAt: new Date(),
    })
    .where(eq(contacts.id, contactId));

  tryUpdateCleaningDismissedAt(contactId, true);
  tryUpdateCleaningUserBucket(contactId, null);
  await logRemovalOutcome(contactId, "disconnected");
  invalidateNetworkHygieneSnapshot();
}

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
    await applyContactDisconnectedState(row.contactId);
    const settings = await getCleaningExecSettings();
    await rollActionGapAfterSuccess(settings);
  } else {
    await logRemovalOutcome(row.contactId, outcome, error ?? null);
    await db
      .update(contacts)
      .set({ lastUpdatedAt: new Date() })
      .where(eq(contacts.id, row.contactId));
  }

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

  await applyContactDisconnectedState(contactId);
}
