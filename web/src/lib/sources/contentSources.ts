import { desc, eq, isNull, and, gte } from "drizzle-orm";
import { getDb } from "@/db";
import {
  contentSourceItems,
  contentSources,
  type ContentSourceConfigJson,
  type ContentSourceType,
} from "@/db/schema";
import type { ContentSourceRow } from "@/lib/sources/types";

function rowFromDb(r: typeof contentSources.$inferSelect): ContentSourceRow {
  return {
    id: r.id,
    name: r.name,
    type: r.type as ContentSourceType,
    configJson: r.configJson,
    enabled: Boolean(r.enabled),
    fetchIntervalHours: r.fetchIntervalHours,
    lastFetchedAt: r.lastFetchedAt,
    lastError: r.lastError,
  };
}

export async function listContentSources(): Promise<ContentSourceRow[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(contentSources)
    .orderBy(desc(contentSources.updatedAt));
  return rows.map(rowFromDb);
}

export async function getContentSourceById(
  id: string,
): Promise<ContentSourceRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(contentSources)
    .where(eq(contentSources.id, id))
    .limit(1);
  return rows[0] ? rowFromDb(rows[0]) : null;
}

export async function upsertContentSource(input: {
  id?: string;
  name: string;
  type: ContentSourceType;
  configJson?: ContentSourceConfigJson | null;
  enabled?: boolean;
  fetchIntervalHours?: number;
}): Promise<string> {
  const db = getDb();
  const id = input.id ?? crypto.randomUUID();
  const now = new Date();
  const existing = await getContentSourceById(id);
  if (existing) {
    await db
      .update(contentSources)
      .set({
        name: input.name,
        type: input.type,
        configJson: input.configJson ?? null,
        enabled: input.enabled ?? true,
        fetchIntervalHours: input.fetchIntervalHours ?? 168,
        updatedAt: now,
      })
      .where(eq(contentSources.id, id));
  } else {
    await db.insert(contentSources).values({
      id,
      name: input.name,
      type: input.type,
      configJson: input.configJson ?? null,
      enabled: input.enabled ?? true,
      fetchIntervalHours: input.fetchIntervalHours ?? 168,
      createdAt: now,
      updatedAt: now,
    });
  }
  return id;
}

export async function setSourceFetchResult(
  id: string,
  error: string | null,
): Promise<void> {
  const db = getDb();
  await db
    .update(contentSources)
    .set({
      lastFetchedAt: new Date(),
      lastError: error,
      updatedAt: new Date(),
    })
    .where(eq(contentSources.id, id));
}

export type SourceItemRow = typeof contentSourceItems.$inferSelect;

export async function listTrendInbox(options?: {
  days?: number;
  limit?: number;
}): Promise<SourceItemRow[]> {
  const days = options?.days ?? 7;
  const since = new Date();
  since.setDate(since.getDate() - days);
  const db = getDb();
  return db
    .select()
    .from(contentSourceItems)
    .where(
      and(
        gte(contentSourceItems.fetchedAt, since),
        isNull(contentSourceItems.dismissedAt),
        isNull(contentSourceItems.usedAt),
      ),
    )
    .orderBy(desc(contentSourceItems.trendScore), desc(contentSourceItems.fetchedAt))
    .limit(options?.limit ?? 15);
}

export async function getSourceItemById(
  id: string,
): Promise<SourceItemRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(contentSourceItems)
    .where(eq(contentSourceItems.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function markSourceItemUsed(id: string): Promise<void> {
  const db = getDb();
  await db
    .update(contentSourceItems)
    .set({ usedAt: new Date() })
    .where(eq(contentSourceItems.id, id));
}

export async function dismissSourceItem(id: string): Promise<void> {
  const db = getDb();
  await db
    .update(contentSourceItems)
    .set({ dismissedAt: new Date() })
    .where(eq(contentSourceItems.id, id));
}

export async function listSourceItemsBySource(
  sourceId: string,
  limit = 50,
): Promise<SourceItemRow[]> {
  const db = getDb();
  return db
    .select()
    .from(contentSourceItems)
    .where(eq(contentSourceItems.sourceId, sourceId))
    .orderBy(desc(contentSourceItems.fetchedAt))
    .limit(limit);
}
