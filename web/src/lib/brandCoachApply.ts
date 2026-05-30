import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contentPosts } from "@/db/schema";
import { updateContentBrandContext } from "@/lib/contentBrandContext";
import {
  createContentPost,
  getContentPostById,
  markContentPostPublished,
  updateContentPost,
} from "@/lib/contentPosts";
import type { CoachAction } from "@/lib/brandCoachTypes";
import { coachActionSchema } from "@/lib/brandCoachTypes";

export type ApplyCoachResult = {
  applied: number;
  errors: string[];
  createdPostIds: string[];
};

function parseScheduledAt(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function applyCoachActions(
  rawActions: unknown[],
): Promise<ApplyCoachResult> {
  const result: ApplyCoachResult = {
    applied: 0,
    errors: [],
    createdPostIds: [],
  };

  for (const raw of rawActions) {
    const parsed = coachActionSchema.safeParse(raw);
    if (!parsed.success) {
      result.errors.push(`Invalid action: ${parsed.error.message}`);
      continue;
    }
    const action = parsed.data;

    try {
      switch (action.type) {
        case "update_post": {
          const patch = action.patch ?? {};
          const dbPatch: Parameters<typeof updateContentPost>[1] = {};
          if (patch.title !== undefined) dbPatch.title = patch.title;
          if (patch.status !== undefined) dbPatch.status = patch.status;
          if (patch.format !== undefined) dbPatch.format = patch.format;
          if (patch.ideaNotes !== undefined) dbPatch.ideaNotes = patch.ideaNotes;
          if (patch.hook !== undefined) dbPatch.hook = patch.hook;
          if (patch.body !== undefined) dbPatch.body = patch.body;
          if (patch.articleBody !== undefined) dbPatch.articleBody = patch.articleBody;
          if (patch.styleNotes !== undefined) dbPatch.styleNotes = patch.styleNotes;
          if (patch.language !== undefined) dbPatch.language = patch.language;
          if (patch.lastCoachSummary !== undefined) {
            dbPatch.lastCoachSummary = patch.lastCoachSummary;
          }
          if (patch.coachFlags !== undefined) {
            dbPatch.coachFlags = patch.coachFlags as Record<string, boolean> | null;
          }
          if (patch.scheduledAt !== undefined) {
            dbPatch.scheduledAt = parseScheduledAt(patch.scheduledAt);
          }
          const ok = await updateContentPost(action.postId, dbPatch);
          if (!ok) result.errors.push(`Post not found: ${action.postId}`);
          else result.applied += 1;
          break;
        }
        case "create_post": {
          const id = await createContentPost({
            title: action.post.title,
            status: action.post.status,
            format: action.post.format,
            ideaNotes: action.post.ideaNotes ?? null,
            hook: action.post.hook ?? null,
            body: action.post.body ?? null,
            language: action.post.language ?? null,
            scheduledAt: parseScheduledAt(action.post.scheduledAt ?? null),
          });
          result.createdPostIds.push(id);
          result.applied += 1;
          break;
        }
        case "reschedule_pipeline": {
          for (const item of action.items) {
            const ok = await updateContentPost(item.postId, {
              scheduledAt: parseScheduledAt(item.scheduledAt),
              ...(item.title ? { title: item.title } : {}),
            });
            if (!ok) result.errors.push(`Post not found: ${item.postId}`);
            else result.applied += 1;
          }
          break;
        }
        case "mark_published": {
          let postId = action.postId;
          if (!postId && action.titleMatch) {
            const db = getDb();
            const rows = await db.select().from(contentPosts).limit(200);
            const match = rows.find((r) =>
              r.title.toLowerCase().includes(action.titleMatch!.toLowerCase()),
            );
            postId = match?.id;
          }
          if (!postId) {
            result.errors.push("mark_published: no matching post.");
            break;
          }
          await markContentPostPublished(postId);
          result.applied += 1;
          break;
        }
        case "suggest_doctrine": {
          await updateContentBrandContext({
            contentDoctrine: action.contentDoctrine,
          });
          result.applied += 1;
          break;
        }
        default: {
          const _exhaustive: never = action;
          void _exhaustive;
        }
      }
    } catch (e) {
      result.errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  return result;
}
