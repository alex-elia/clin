import { and, desc, eq } from "drizzle-orm";
import { getDb, getSqlite } from "@/db";
import { captureSessions } from "@/db/schema";
import {
  computeLinkedInActivity,
  type LinkedInActivityAssessment,
  type LinkedInActivityTier,
  isLinkedInActivityTier,
} from "@/lib/linkedinActivity";
import { chunkIds } from "@/lib/sqliteInChunks";

export type ContactActivityExtension = {
  activityTier: LinkedInActivityTier | null;
  activityScore: number | null;
  activityComputedAt: number | null;
  newestPostAgeLabel: string | null;
};

export function selectContactActivityExtension(
  contactId: string,
): ContactActivityExtension | null {
  try {
    const row = getSqlite()
      .prepare(
        `SELECT activity_tier AS tier, activity_score AS score,
                activity_computed_at AS computedAt, newest_post_age_label AS ageLabel
         FROM contacts WHERE id = ?`,
      )
      .get(contactId) as
      | {
          tier: string | null;
          score: number | null;
          computedAt: number | null;
          ageLabel: string | null;
        }
      | undefined;
    if (!row) return null;
    return {
      activityTier:
        row.tier && isLinkedInActivityTier(row.tier) ? row.tier : null,
      activityScore: row.score ?? null,
      activityComputedAt: row.computedAt ?? null,
      newestPostAgeLabel: row.ageLabel ?? null,
    };
  } catch {
    return null;
  }
}

export function listContactActivityExtensionsMap(
  contactIds: string[],
): Map<string, ContactActivityExtension> {
  const map = new Map<string, ContactActivityExtension>();
  if (contactIds.length === 0) return map;
  const empty: ContactActivityExtension = {
    activityTier: null,
    activityScore: null,
    activityComputedAt: null,
    newestPostAgeLabel: null,
  };
  try {
    for (const chunk of chunkIds(contactIds)) {
      const placeholders = chunk.map(() => "?").join(",");
      const rows = getSqlite()
        .prepare(
          `SELECT id, activity_tier AS tier, activity_score AS score,
                  activity_computed_at AS computedAt, newest_post_age_label AS ageLabel
           FROM contacts WHERE id IN (${placeholders})`,
        )
        .all(...chunk) as {
        id: string;
        tier: string | null;
        score: number | null;
        computedAt: number | null;
        ageLabel: string | null;
      }[];
      for (const row of rows) {
        map.set(row.id, {
          activityTier:
            row.tier && isLinkedInActivityTier(row.tier) ? row.tier : null,
          activityScore: row.score ?? null,
          activityComputedAt: row.computedAt ?? null,
          newestPostAgeLabel: row.ageLabel ?? null,
        });
      }
    }
    for (const id of contactIds) {
      if (!map.has(id)) map.set(id, { ...empty });
    }
  } catch {
    for (const id of contactIds) map.set(id, { ...empty });
  }
  return map;
}

export function tryUpdateContactActivity(
  contactId: string,
  assessment: LinkedInActivityAssessment,
): void {
  try {
    const now = Date.now();
    getSqlite()
      .prepare(
        `UPDATE contacts SET
          activity_tier = ?,
          activity_score = ?,
          activity_computed_at = ?,
          newest_post_age_label = ?,
          last_updated_at = ?
         WHERE id = ?`,
      )
      .run(
        assessment.tier,
        assessment.score,
        now,
        assessment.newestPostAgeLabel,
        now,
        contactId,
      );
  } catch {
    /* optional columns */
  }
}

export async function loadLatestPostsCaptureForActivity(
  contactId: string,
): Promise<{
  capturedAt: string | null;
  profilePosts: { text?: string; ageLabel?: string; postKind?: string }[];
  hasPostsCapture: boolean;
}> {
  const db = getDb();
  const row = await db.query.captureSessions.findFirst({
    where: and(
      eq(captureSessions.contactId, contactId),
      eq(captureSessions.pageType, "posts"),
    ),
    orderBy: [desc(captureSessions.capturedAt)],
  });
  if (!row) {
    return { capturedAt: null, profilePosts: [], hasPostsCapture: false };
  }
  const raw = row.extractedJson;
  const json =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;
  const posts = json?.profilePosts;
  return {
    capturedAt: row.capturedAt.toISOString(),
    profilePosts: Array.isArray(posts)
      ? (posts as { text?: string; ageLabel?: string; postKind?: string }[])
      : [],
    hasPostsCapture: true,
  };
}

export async function recomputeContactActivityFromCaptures(
  contactId: string,
): Promise<LinkedInActivityAssessment> {
  const capture = await loadLatestPostsCaptureForActivity(contactId);
  const assessment = computeLinkedInActivity({
    profilePosts: capture.profilePosts,
    postsCapturedAt: capture.capturedAt,
    hasPostsCapture: capture.hasPostsCapture,
  });
  if (assessment.tier !== "unknown") {
    tryUpdateContactActivity(contactId, assessment);
  }
  return assessment;
}
