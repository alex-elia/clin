import { getContentPostById, listContentPosts, updateContentPost } from "@/lib/contentPosts";
import type { PublishingRhythmJson } from "@/db/schema";

function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** After coach creates posts, unschedule excess new posts in the busiest ISO week. */
export async function enforceMaxPostsPerWeek(
  createdPostIds: string[],
  rhythm: PublishingRhythmJson | null,
): Promise<number> {
  const max = rhythm?.maxPostsPerWeek;
  if (!max || max < 1 || !createdPostIds.length) return 0;

  const byWeek = new Map<string, string[]>();
  for (const id of createdPostIds) {
    const post = await getContentPostById(id);
    if (!post?.scheduledAt) continue;
    const key = isoWeekKey(post.scheduledAt);
    const list = byWeek.get(key) ?? [];
    list.push(id);
    byWeek.set(key, list);
  }

  let trimmed = 0;
  for (const [, ids] of byWeek) {
    if (ids.length <= max) continue;
    const allInWeek = await listContentPosts({ limit: 200 });
    const weekKey = isoWeekKey(
      (await getContentPostById(ids[0]!))!.scheduledAt!,
    );
    const scheduledInWeek = allInWeek.filter(
      (p) =>
        p.scheduledAt &&
        isoWeekKey(p.scheduledAt) === weekKey &&
        p.status !== "published" &&
        p.status !== "archived",
    );
    const excess = scheduledInWeek.length - max;
    if (excess <= 0) continue;
    const toTrim = scheduledInWeek
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
      .slice(0, excess);
    for (const p of toTrim) {
      if (!createdPostIds.includes(p.id)) continue;
      await updateContentPost(p.id, { scheduledAt: null });
      trimmed += 1;
    }
  }
  return trimmed;
}
