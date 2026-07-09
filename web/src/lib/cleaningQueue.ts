import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { actionQueue, contacts } from "@/db/schema";
import {
  bucketQueuePriority,
  bucketSuggestedQueueText,
  resolveCleaningBucket,
  type CleaningBucket,
} from "@/lib/cleaningBuckets";
import { pickLatestAnalysisView } from "@/lib/contactLlmDisplay";
import { loadLatestProfileCapturesByContactId } from "@/lib/campaignMemberReadiness";
import { listContactCleaningExtensionsMap } from "@/lib/cleaningSqlExtras";
import { selectContactActivityExtension } from "@/lib/contactActivitySqlExtras";
import type { InboxThreadAnalysis } from "@/lib/inboxThreadAnalysisTypes";
import {
  assessContactReadiness,
  loadMessagingCaptureFlags,
} from "@/lib/contactReadiness";

const QUEUE_BUCKETS = new Set<CleaningBucket>([
  "review_remove",
  "reach_out_dm",
  "engage_comment",
  "nurture_light",
  "needs_review",
]);

/** After LLM analysis, surface actionable items in the review queue. */
export async function syncCleaningQueueFromAnalysis(
  contactId: string,
  envelope: Record<string, unknown>,
  segment: string,
  threadAnalysis?: InboxThreadAnalysis | null,
): Promise<void> {
  const view = pickLatestAnalysisView(envelope);
  if (!view) return;

  const db = getDb();
  const row = await db.query.contacts.findFirst({
    where: eq(contacts.id, contactId),
  });
  if (!row) return;

  const caps = await loadLatestProfileCapturesByContactId([contactId]);
  const hasMessaging = loadMessagingCaptureFlags([contactId]).has(contactId);
  const readiness = assessContactReadiness(row, caps, hasMessaging);
  const cleaningExt = listContactCleaningExtensionsMap([contactId]).get(
    contactId,
  ) ?? { cleaningUserBucket: null, cleaningDismissedAt: null };
  const bucket = resolveCleaningBucket({
    readiness,
    analysis: view,
    segment,
    hasLlmAnalysis: true,
    threadAnalysis: threadAnalysis ?? null,
    cleaningUserBucket: cleaningExt.cleaningUserBucket,
    cleaningDismissedAt: cleaningExt.cleaningDismissedAt,
    activityTier: selectContactActivityExtension(contactId)?.activityTier ?? null,
  });
  if (!bucket) return;

  if (!QUEUE_BUCKETS.has(bucket)) return;

  const suggestedAction = bucketSuggestedQueueText(
    bucket,
    view,
    threadAnalysis ?? null,
  );
  const priority = bucketQueuePriority(bucket);
  const kind =
    bucket === "reach_out_dm" ? "outreach_prep" : "review";

  const existing = await db.query.actionQueue.findFirst({
    where: and(
      eq(actionQueue.contactId, contactId),
      eq(actionQueue.status, "pending"),
    ),
  });

  if (existing) {
    await db
      .update(actionQueue)
      .set({
        suggestedAction,
        priority: Math.max(existing.priority, priority),
        kind,
      })
      .where(eq(actionQueue.id, existing.id));
    return;
  }

  await db.insert(actionQueue).values({
    id: crypto.randomUUID(),
    contactId,
    status: "pending",
    priority,
    suggestedAction,
    kind,
    outreachDecision: "pending",
    createdAt: new Date(),
  });
}
