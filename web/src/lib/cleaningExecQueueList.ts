import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { cleaningExecQueue, contacts } from "@/db/schema";
import { generateEngageCommentForContact } from "@/lib/cleaningEngageComment";
import { acknowledgeRemovalExec } from "@/lib/cleaningRemovalAck";
import {
  completeCleaningExec,
  type CleaningExecKind,
} from "@/lib/cleaningExecQueue";
import { getLatestPostsCaptureJson } from "@/lib/profileCaptureContext";
import { pickFirstRecentPost } from "@/lib/profilePostRecency";
import { type ProfilePostKind } from "@/lib/profilePostKinds";

export type CleaningExecListItem = {
  execId: string;
  contactId: string;
  kind: CleaningExecKind;
  fullName: string | null;
  headline: string | null;
  linkedinUrl: string | null;
  activityUrl: string | null;
  suggestedComment: string | null;
  commentAngle: string | null;
  engagementHook: string | null;
  rationale: string | null;
  targetPostPreview: string | null;
  targetPostAge: string | null;
  targetPostKind: ProfilePostKind | null;
  targetPostUserComment: string | null;
  createdAt: Date;
};

export function linkedinActivityUrl(
  profileUrl: string | null | undefined,
): string | null {
  if (typeof profileUrl !== "string" || !profileUrl.trim()) return null;
  try {
    const u = new URL(profileUrl);
    const m = u.pathname.match(/\/in\/([^/]+)/i);
    if (!m?.[1]) return null;
    return `https://www.linkedin.com/in/${m[1]}/recent-activity/all/`;
  } catch {
    return null;
  }
}

async function firstPostPreview(contactId: string): Promise<{
  preview: string | null;
  age: string | null;
  kind: ProfilePostKind | null;
  userComment: string | null;
}> {
  const raw = await getLatestPostsCaptureJson(contactId);
  if (!raw) return { preview: null, age: null, kind: null, userComment: null };
  const posts = raw.profilePosts;
  if (!Array.isArray(posts)) {
    return { preview: null, age: null, kind: null, userComment: null };
  }

  const first = pickFirstRecentPost(
    posts as {
      text?: string;
      ageLabel?: string;
      postKind?: ProfilePostKind;
      userComment?: string;
      sharedTitle?: string;
    }[],
  );
  if (!first) return { preview: null, age: null, kind: null, userComment: null };

  const kind =
    first.postKind === "original" ||
    first.postKind === "reshare" ||
    first.postKind === "news_share"
      ? first.postKind
      : null;
  const age =
    typeof first.ageLabel === "string" ? first.ageLabel.trim() : null;
  const userComment =
    typeof first.userComment === "string" ? first.userComment.trim() : null;
  const sharedTitle =
    typeof first.sharedTitle === "string" ? first.sharedTitle.trim() : "";
  const text = typeof first.text === "string" ? first.text.trim() : "";
  const previewSource =
    kind === "news_share" || kind === "reshare"
      ? userComment || sharedTitle || text
      : text;
  if (!previewSource) {
    return { preview: null, age, kind, userComment };
  }
  const preview =
    previewSource.length > 280
      ? `${previewSource.slice(0, 277)}…`
      : previewSource;
  return { preview, age, kind, userComment };
}

export async function listPendingCleaningExecItems(opts?: {
  kind?: CleaningExecKind;
  limit?: number;
}): Promise<CleaningExecListItem[]> {
  const db = getDb();
  const limit = Math.min(100, Math.max(1, opts?.limit ?? 50));

  const rows = await db.query.cleaningExecQueue.findMany({
    where: and(
      eq(cleaningExecQueue.status, "pending"),
      opts?.kind ? eq(cleaningExecQueue.kind, opts.kind) : undefined,
    ),
    orderBy: asc(cleaningExecQueue.createdAt),
    limit,
  });

  const items: CleaningExecListItem[] = [];
  for (const row of rows) {
    const contact = await db.query.contacts.findFirst({
      where: eq(contacts.id, row.contactId),
    });
    if (!contact) continue;

    const payload = (row.payloadJson ?? {}) as Record<string, unknown>;
    const post = await firstPostPreview(row.contactId);
    const linkedinUrl = contact.linkedinUrlCanonical;

    items.push({
      execId: row.id,
      contactId: row.contactId,
      kind: row.kind as CleaningExecKind,
      fullName: contact.fullName,
      headline: contact.headline,
      linkedinUrl,
      activityUrl: linkedinActivityUrl(linkedinUrl),
      suggestedComment:
        typeof payload.suggestedComment === "string"
          ? payload.suggestedComment
          : null,
      commentAngle:
        typeof payload.commentAngle === "string" ? payload.commentAngle : null,
      engagementHook:
        typeof payload.engagementHook === "string"
          ? payload.engagementHook
          : null,
      rationale:
        typeof payload.rationale === "string" ? payload.rationale : null,
      targetPostPreview: post.preview,
      targetPostAge: post.age,
      targetPostKind: post.kind,
      targetPostUserComment: post.userComment,
      createdAt: row.createdAt,
    });
  }

  return items;
}

export async function updateCleaningExecItem(
  execId: string,
  patch: {
    suggestedComment?: string;
    skip?: boolean;
    regenerateComment?: boolean;
    markDisconnected?: boolean;
  },
): Promise<CleaningExecListItem | null> {
  const db = getDb();
  const row = await db.query.cleaningExecQueue.findFirst({
    where: eq(cleaningExecQueue.id, execId),
  });
  if (!row || row.status !== "pending") {
    throw new Error("Queue item not found or already completed.");
  }

  if (patch.markDisconnected) {
    if (row.kind !== "removal") {
      throw new Error("Only removal items can be marked disconnected.");
    }
    await acknowledgeRemovalExec(execId, "disconnected");
    return null;
  }

  if (patch.skip) {
    await completeCleaningExec({
      id: execId,
      outcome: "skipped",
    });
    return null;
  }

  const payload = { ...(row.payloadJson ?? {}) } as Record<string, unknown>;

  if (patch.regenerateComment) {
    if (row.kind !== "engage") {
      throw new Error("Only engage items support comment regeneration.");
    }
    const generated = await generateEngageCommentForContact(row.contactId);
    if (!generated.ok) {
      throw new Error(generated.error || "Could not regenerate comment.");
    }
    payload.suggestedComment = generated.comment;
  } else if (patch.suggestedComment !== undefined) {
    if (row.kind !== "engage") {
      throw new Error("Only engage items have editable comments.");
    }
    const trimmed = patch.suggestedComment.trim();
    if (!trimmed) throw new Error("Comment cannot be empty.");
    payload.suggestedComment = trimmed;
  }

  if (patch.regenerateComment || patch.suggestedComment !== undefined) {
    await db
      .update(cleaningExecQueue)
      .set({ payloadJson: payload })
      .where(eq(cleaningExecQueue.id, execId));
  }

  const updated = (await listPendingCleaningExecItems({ limit: 100 })).find(
    (i) => i.execId === execId,
  );
  return updated ?? null;
}
