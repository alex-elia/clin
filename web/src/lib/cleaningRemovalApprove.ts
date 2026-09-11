import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { actionQueue, contacts } from "@/db/schema";
import { setContactSegment } from "@/lib/autopilotActions";
import { enqueueCleaningExec } from "@/lib/cleaningExecQueue";
import { cleaningCanDisconnect } from "@/lib/cleaningNetwork";

export function isRemovalQueueItem(input: {
  suggestedAction: string | null;
  segment: string;
}): boolean {
  const text = input.suggestedAction?.toLowerCase() ?? "";
  return (
    input.segment === "remove_candidate" ||
    text.includes("disconnect") ||
    text.includes("removal") ||
    text.includes("remove")
  );
}

async function markPendingQueueReviewed(contactId: string): Promise<void> {
  const db = getDb();
  const pending = await db.query.actionQueue.findFirst({
    where: and(
      eq(actionQueue.contactId, contactId),
      eq(actionQueue.status, "pending"),
    ),
  });
  if (!pending || pending.status !== "pending") return;
  await db
    .update(actionQueue)
    .set({ status: "reviewed", reviewedAt: new Date() })
    .where(eq(actionQueue.id, pending.id));
}

/** Enqueue removal exec directly from the cleaning board (no /queue hop). */
export async function approveRemovalForContact(
  contactId: string,
  rationale?: string | null,
): Promise<string> {
  const db = getDb();
  const contact = await db.query.contacts.findFirst({
    where: eq(contacts.id, contactId),
  });
  if (!contact) throw new Error("Contact not found.");
  if (!cleaningCanDisconnect(contact.connectionDegree)) {
    throw new Error(
      "Not a 1st-degree connection. LinkedIn disconnect is only for 1st.",
    );
  }

  await setContactSegment(contactId, "remove_candidate");
  const execId = await enqueueCleaningExec({
    contactId,
    kind: "removal",
    payload: {
      rationale: rationale?.trim() || "Accepted from cleaning board.",
      approvedFromCleaning: true,
    },
  });
  await markPendingQueueReviewed(contactId);
  return execId;
}

export async function approveRemovalFromQueue(queueId: string): Promise<void> {
  const db = getDb();
  const row = await db.query.actionQueue.findFirst({
    where: eq(actionQueue.id, queueId),
  });
  if (!row) throw new Error("Queue item not found.");

  const contact = await db.query.contacts.findFirst({
    where: eq(contacts.id, row.contactId),
  });
  if (!contact) throw new Error("Contact not found.");

  await approveRemovalForContact(row.contactId, row.suggestedAction);
  await db
    .update(actionQueue)
    .set({ status: "reviewed", reviewedAt: new Date() })
    .where(eq(actionQueue.id, queueId));
}
