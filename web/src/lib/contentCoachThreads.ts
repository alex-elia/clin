import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contentAiMessages, contentAiThreads } from "@/db/schema";
import type { CoachAction } from "@/lib/brandCoachTypes";

export type CoachThreadScope = "studio" | "post";

export async function getOrCreateThread(options: {
  threadId?: string;
  scope: CoachThreadScope;
  postId?: string | null;
  title?: string;
}): Promise<{ id: string }> {
  const db = getDb();
  if (options.threadId) {
    const row = await db
      .select()
      .from(contentAiThreads)
      .where(eq(contentAiThreads.id, options.threadId))
      .limit(1);
    if (row[0]) return { id: row[0].id };
  }

  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(contentAiThreads).values({
    id,
    scope: options.scope,
    postId: options.postId ?? null,
    title: options.title ?? null,
    createdAt: now,
    updatedAt: now,
  });
  return { id };
}

export async function listThreadMessages(threadId: string, limit = 40) {
  const db = getDb();
  return db
    .select()
    .from(contentAiMessages)
    .where(eq(contentAiMessages.threadId, threadId))
    .orderBy(asc(contentAiMessages.createdAt))
    .limit(limit);
}

export async function appendThreadMessage(
  threadId: string,
  role: "user" | "assistant",
  content: string,
  actionsJson?: CoachAction[],
): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db.insert(contentAiMessages).values({
    id: crypto.randomUUID(),
    threadId,
    role,
    content,
    actionsJson: actionsJson?.length ? actionsJson : null,
    createdAt: now,
  });
  await db
    .update(contentAiThreads)
    .set({ updatedAt: now })
    .where(eq(contentAiThreads.id, threadId));
}

export async function getLatestStudioThread(): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(contentAiThreads)
    .where(eq(contentAiThreads.scope, "studio"))
    .orderBy(desc(contentAiThreads.updatedAt))
    .limit(1);
  return rows[0]?.id ?? null;
}
