import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { actionQueue, contacts } from "@/db/schema";
import { setContactSegment } from "@/lib/autopilotActions";
import { enqueueCleaningExec } from "@/lib/cleaningExecQueue";

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

  await setContactSegment(row.contactId, "remove_candidate");
  await enqueueCleaningExec({
    contactId: row.contactId,
    kind: "removal",
    payload: {
      rationale: row.suggestedAction,
      approvedFromQueue: queueId,
    },
  });

  await db
    .update(actionQueue)
    .set({ status: "reviewed", reviewedAt: new Date() })
    .where(eq(actionQueue.id, queueId));
}
