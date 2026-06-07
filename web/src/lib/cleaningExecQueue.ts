import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { cleaningExecQueue } from "@/db/schema";

export type CleaningExecKind = "removal" | "engage";
export type CleaningExecStatus = "pending" | "in_progress" | "done" | "skipped" | "failed";

export async function enqueueCleaningExec(opts: {
  contactId: string;
  kind: CleaningExecKind;
  payload?: Record<string, unknown>;
}): Promise<string> {
  const db = getDb();
  const existing = await db.query.cleaningExecQueue.findFirst({
    where: and(
      eq(cleaningExecQueue.contactId, opts.contactId),
      eq(cleaningExecQueue.kind, opts.kind),
      eq(cleaningExecQueue.status, "pending"),
    ),
  });
  if (existing) {
    if (opts.payload) {
      await db
        .update(cleaningExecQueue)
        .set({ payloadJson: opts.payload })
        .where(eq(cleaningExecQueue.id, existing.id));
    }
    return existing.id;
  }

  const id = crypto.randomUUID();
  await db.insert(cleaningExecQueue).values({
    id,
    contactId: opts.contactId,
    kind: opts.kind,
    status: "pending",
    payloadJson: opts.payload ?? null,
    createdAt: new Date(),
  });
  return id;
}

export async function countPendingExec(kind: CleaningExecKind): Promise<number> {
  const db = getDb();
  const rows = await db.query.cleaningExecQueue.findMany({
    where: and(
      eq(cleaningExecQueue.kind, kind),
      eq(cleaningExecQueue.status, "pending"),
    ),
  });
  return rows.length;
}

export async function completeCleaningExec(opts: {
  id: string;
  outcome: string;
  error?: string | null;
}): Promise<void> {
  const db = getDb();
  await db
    .update(cleaningExecQueue)
    .set({
      status:
        opts.outcome === "skipped"
          ? "skipped"
          : opts.outcome === "failed"
            ? "failed"
            : "done",
      outcome: opts.outcome,
      error: opts.error ?? null,
      completedAt: new Date(),
    })
    .where(eq(cleaningExecQueue.id, opts.id));
}
