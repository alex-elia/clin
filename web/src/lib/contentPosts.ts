import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lte, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { contentPosts, type ContentMediaJson } from "@/db/schema";
import type {
  ContentPostFormat,
  ContentPostStatus,
} from "@/lib/contentPostsShared";
import { hasRequiredPostImage } from "@/lib/contentPostMedia";
import { formatPostForLinkedInClipboard } from "@/lib/linkedinPostClipboard";

export type ContentPostRow = typeof contentPosts.$inferSelect;

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export async function getContentPostById(
  id: string,
): Promise<ContentPostRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(contentPosts)
    .where(eq(contentPosts.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listContentPosts(options?: {
  statuses?: ContentPostStatus[];
  excludeArchived?: boolean;
  limit?: number;
}): Promise<ContentPostRow[]> {
  const db = getDb();
  const conditions = [];
  if (options?.excludeArchived !== false) {
    conditions.push(ne(contentPosts.status, "archived"));
  }
  if (options?.statuses?.length) {
    conditions.push(inArray(contentPosts.status, options.statuses));
  }
  let q = db.select().from(contentPosts);
  if (conditions.length) {
    q = q.where(and(...conditions)) as typeof q;
  }
  return q
    .orderBy(asc(contentPosts.scheduledAt), desc(contentPosts.updatedAt))
    .limit(options?.limit ?? 200);
}

/** Local calendar month: `month` is 0–11 (same as `Date#getMonth`). */
export function isInLocalCalendarMonth(
  scheduledAt: Date,
  year: number,
  month: number,
): boolean {
  const d = new Date(scheduledAt);
  return d.getFullYear() === year && d.getMonth() === month;
}

/** Posts with scheduledAt in local calendar month (SQL range — not limited by global list cap). */
export async function listScheduledPostsInCalendarMonth(
  year: number,
  month: number,
): Promise<ContentPostRow[]> {
  const start = new Date(year, month, 1, 0, 0, 0, 0);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
  const db = getDb();
  return db
    .select()
    .from(contentPosts)
    .where(
      and(
        ne(contentPosts.status, "archived"),
        isNotNull(contentPosts.scheduledAt),
        gte(contentPosts.scheduledAt, start),
        lte(contentPosts.scheduledAt, end),
      ),
    )
    .orderBy(asc(contentPosts.scheduledAt), desc(contentPosts.updatedAt));
}

export async function countScheduledPosts(): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: count() })
    .from(contentPosts)
    .where(
      and(
        ne(contentPosts.status, "archived"),
        isNotNull(contentPosts.scheduledAt),
      ),
    );
  return row?.n ?? 0;
}

/** @deprecated Prefer listScheduledPostsInCalendarMonth */
export async function listPostsInMonth(year: number, month: number) {
  return listScheduledPostsInCalendarMonth(year, month);
}

export async function listReadyPostsForExtension(limit = 30) {
  const db = getDb();
  return db
    .select()
    .from(contentPosts)
    .where(eq(contentPosts.status, "ready"))
    .orderBy(asc(contentPosts.scheduledAt), desc(contentPosts.readyAt))
    .limit(limit);
}

export async function listRecentPublished(limit = 5) {
  const db = getDb();
  return db
    .select()
    .from(contentPosts)
    .where(eq(contentPosts.status, "published"))
    .orderBy(desc(contentPosts.publishedAt))
    .limit(limit);
}

export async function listUnscheduledBacklog() {
  const db = getDb();
  return db
    .select()
    .from(contentPosts)
    .where(
      and(
        inArray(contentPosts.status, ["idea", "drafting", "review"]),
        isNull(contentPosts.scheduledAt),
      ),
    )
    .orderBy(desc(contentPosts.updatedAt));
}

export type CreateContentPostInput = {
  title: string;
  status?: ContentPostStatus;
  format?: ContentPostFormat;
  ideaNotes?: string | null;
  hook?: string | null;
  body?: string | null;
  articleBody?: string | null;
  styleNotes?: string | null;
  mediaJson?: ContentMediaJson | null;
  scheduledAt?: Date | null;
  language?: string | null;
  sourceItemIds?: string[] | null;
  planningWeek?: string | null;
};

export async function createContentPost(
  input: CreateContentPostInput,
): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date();
  const db = getDb();
  await db.insert(contentPosts).values({
    id,
    title: input.title.trim() || "Untitled",
    status: input.status ?? "idea",
    format: input.format ?? "feed",
    ideaNotes: input.ideaNotes ?? null,
    hook: input.hook ?? null,
    body: input.body ?? null,
    articleBody: input.articleBody ?? null,
    styleNotes: input.styleNotes ?? null,
    mediaJson: input.mediaJson ?? null,
    scheduledAt: input.scheduledAt ?? null,
    language: input.language ?? null,
    sourceItemIds: input.sourceItemIds ?? null,
    planningWeek: input.planningWeek ?? null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export type UpdateContentPostPatch = Partial<{
  title: string;
  status: ContentPostStatus;
  format: ContentPostFormat;
  ideaNotes: string | null;
  hook: string | null;
  body: string | null;
  articleBody: string | null;
  styleNotes: string | null;
  mediaJson: ContentMediaJson | null;
  coachFlags: Record<string, boolean> | null;
  lastCoachSummary: string | null;
  scheduledAt: Date | null;
  language: string | null;
  readyAt: Date | null;
  publishedAt: Date | null;
  sourceItemIds: string[] | null;
  planningWeek: string | null;
}>;

export async function updateContentPost(
  id: string,
  patch: UpdateContentPostPatch,
): Promise<boolean> {
  const existing = await getContentPostById(id);
  if (!existing) return false;
  const db = getDb();
  await db
    .update(contentPosts)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(contentPosts.id, id));
  return true;
}

export async function markContentPostReady(id: string): Promise<{ ok: boolean; error?: string }> {
  const post = await getContentPostById(id);
  if (!post) return { ok: false, error: "Post not found." };
  const text = (post.body ?? "").trim() || (post.hook ?? "").trim();
  if (!text) {
    return { ok: false, error: "Add a hook or body before marking ready." };
  }
  if (!hasRequiredPostImage(post.mediaJson, post.format)) {
    return {
      ok: false,
      error:
        "Add a post image (photo or text graphic) in section 3, save the post, then mark ready.",
    };
  }
  await updateContentPost(id, {
    status: "ready",
    readyAt: new Date(),
  });
  return { ok: true };
}

export async function markContentPostPublished(id: string): Promise<void> {
  await updateContentPost(id, {
    status: "published",
    publishedAt: new Date(),
  });
}

export async function formatPostForClipboard(
  post: ContentPostRow,
): Promise<string> {
  const { getOrCreateContentBrandContext } = await import(
    "@/lib/contentBrandContext"
  );
  const brand = await getOrCreateContentBrandContext();
  const unicodeEmphasis =
    brand.editorialAutopilotPolicy?.useUnicodeEmphasis !== false;
  return formatPostForLinkedInClipboard(post, { unicodeEmphasis });
}

export function postsByLocalDay(
  posts: ContentPostRow[],
  year: number,
  month: number,
): Map<number, ContentPostRow[]> {
  const map = new Map<number, ContentPostRow[]>();
  for (const p of posts) {
    if (!p.scheduledAt) continue;
    if (!isInLocalCalendarMonth(p.scheduledAt, year, month)) continue;
    const day = new Date(p.scheduledAt).getDate();
    const list = map.get(day) ?? [];
    list.push(p);
    map.set(day, list);
  }
  return map;
}

export { startOfLocalDay, endOfLocalDay };
