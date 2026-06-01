import { and, asc, desc, eq, inArray, lte, or, isNull, lt } from "drizzle-orm";
import { getDb } from "@/db";
import {
  editorialJobs,
  type EditorialJobStatus,
  type EditorialJobType,
} from "@/db/schema";

const LOCK_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;

export type EditorialJobRow = typeof editorialJobs.$inferSelect;

export async function enqueueEditorialJob(input: {
  type: EditorialJobType;
  postId?: string | null;
  payloadJson?: Record<string, unknown>;
  runAfter?: Date;
}): Promise<string> {
  const id = crypto.randomUUID();
  const db = getDb();
  await db.insert(editorialJobs).values({
    id,
    type: input.type,
    postId: input.postId ?? null,
    payloadJson: input.payloadJson ?? null,
    runAfter: input.runAfter ?? new Date(),
    status: "pending",
    attempts: 0,
    createdAt: new Date(),
  });
  return id;
}

export async function hasPendingDraftJobForPost(
  postId: string,
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: editorialJobs.id })
    .from(editorialJobs)
    .where(
      and(
        eq(editorialJobs.postId, postId),
        eq(editorialJobs.type, "draft_post"),
        inArray(editorialJobs.status, ["pending", "running"]),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function listDueEditorialJobs(limit = 5): Promise<EditorialJobRow[]> {
  const now = new Date();
  const db = getDb();
  const rows = await db
    .select()
    .from(editorialJobs)
    .where(
      and(
        eq(editorialJobs.status, "pending"),
        lte(editorialJobs.runAfter, now),
        or(
          isNull(editorialJobs.lockedUntil),
          lt(editorialJobs.lockedUntil, now),
        ),
      ),
    )
    .orderBy(asc(editorialJobs.runAfter))
    .limit(limit);
  return rows;
}

export async function tryLockEditorialJob(
  id: string,
): Promise<EditorialJobRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(editorialJobs)
    .where(eq(editorialJobs.id, id))
    .limit(1);
  const job = rows[0];
  if (!job || job.status !== "pending") return null;
  const now = new Date();
  if (job.lockedUntil && job.lockedUntil > now) return null;
  const lockedUntil = new Date(now.getTime() + LOCK_MS);
  await db
    .update(editorialJobs)
    .set({
      status: "running",
      lockedUntil,
      attempts: (job.attempts ?? 0) + 1,
    })
    .where(eq(editorialJobs.id, id));
  const updated = await db
    .select()
    .from(editorialJobs)
    .where(eq(editorialJobs.id, id))
    .limit(1);
  return updated[0] ?? null;
}

export async function finishEditorialJob(
  id: string,
  status: Extract<EditorialJobStatus, "done" | "failed" | "cancelled">,
  lastError?: string | null,
): Promise<void> {
  const db = getDb();
  await db
    .update(editorialJobs)
    .set({
      status,
      lastError: lastError ?? null,
      lockedUntil: null,
      finishedAt: new Date(),
    })
    .where(eq(editorialJobs.id, id));
}

export async function releaseStaleLocks(): Promise<number> {
  const db = getDb();
  const now = new Date();
  const stale = await db
    .select()
    .from(editorialJobs)
    .where(
      and(
        eq(editorialJobs.status, "running"),
        lt(editorialJobs.lockedUntil, now),
      ),
    );
  for (const job of stale) {
    const attempts = job.attempts ?? 0;
    if (attempts >= MAX_ATTEMPTS) {
      await finishEditorialJob(job.id, "failed", "Max attempts exceeded (stale lock).");
    } else {
      await db
        .update(editorialJobs)
        .set({ status: "pending", lockedUntil: null })
        .where(eq(editorialJobs.id, job.id));
    }
  }
  return stale.length;
}

export async function getRecentEditorialJobs(limit = 20): Promise<EditorialJobRow[]> {
  const db = getDb();
  return db
    .select()
    .from(editorialJobs)
    .orderBy(desc(editorialJobs.createdAt))
    .limit(limit);
}
