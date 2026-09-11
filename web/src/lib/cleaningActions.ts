import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { actionQueue, contacts } from "@/db/schema";
import {
  bucketQueuePriority,
  bucketSuggestedQueueText,
  isCleaningBucket,
  resolveCleaningBucket,
  type CleaningBucket,
} from "@/lib/cleaningBuckets";
import { buildContactPlaybookFromAnalysis } from "@/lib/contactPlaybook";
import { pickLatestAnalysisView } from "@/lib/contactLlmDisplay";
import {
  assessContactReadiness,
  loadMessagingCaptureFlags,
} from "@/lib/contactReadiness";
import { getLatestThreadAnalysisForContact } from "@/lib/inboxThreadAnalysisStore";
import {
  listContactCleaningExtensionsMap,
  tryUpdateCleaningDismissedAt,
  tryUpdateCleaningUserBucket,
} from "@/lib/cleaningSqlExtras";
import { listContactLlmExtensionsMap } from "@/lib/contactSqlExtras";
import { selectContactActivityExtension } from "@/lib/contactActivitySqlExtras";
import { loadLatestProfileCapturesByContactId } from "@/lib/campaignMemberReadiness";
import { enqueueCleaningExec } from "@/lib/cleaningExecQueue";
import { generateEngageCommentForContact } from "@/lib/cleaningEngageComment";
import { approveRemovalForContact } from "@/lib/cleaningRemovalApprove";
import { confirmContactDisconnected } from "@/lib/cleaningRemovalAck";
import { cleaningCanDisconnect } from "@/lib/cleaningNetwork";

const QUEUE_BUCKETS = new Set<CleaningBucket>([
  "review_remove",
  "reach_out_dm",
  "engage_comment",
  "nurture_light",
  "needs_review",
]);

function parseEnvelope(raw: string | null): unknown {
  if (!raw?.trim()) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

async function loadContactContext(contactId: string) {
  const db = getDb();
  const row = await db.query.contacts.findFirst({
    where: eq(contacts.id, contactId),
  });
  if (!row) return null;

  const ext = listContactLlmExtensionsMap([contactId]).get(contactId);
  const cleaningExt = listContactCleaningExtensionsMap([contactId]).get(
    contactId,
  ) ?? { cleaningUserBucket: null, cleaningDismissedAt: null };
  const rawRefined = parseEnvelope(ext?.llmRefinedJson ?? null);
  const rawProv = parseEnvelope(ext?.llmProvisionalJson ?? null);
  const analysis = pickLatestAnalysisView(rawRefined, rawProv);
  const caps = await loadLatestProfileCapturesByContactId([contactId]);
  const hasMessaging = loadMessagingCaptureFlags([contactId]).has(contactId);
  const readiness = assessContactReadiness(row, caps, hasMessaging);
  const threadStored = hasMessaging
    ? getLatestThreadAnalysisForContact(contactId)
    : null;
  const threadAnalysis = threadStored?.analysis ?? null;
  const bucket = resolveCleaningBucket({
    readiness,
    analysis,
    segment: row.segment,
    hasLlmAnalysis: Boolean(analysis),
    threadAnalysis,
    cleaningUserBucket: cleaningExt.cleaningUserBucket,
    cleaningDismissedAt: cleaningExt.cleaningDismissedAt,
    activityTier: selectContactActivityExtension(contactId)?.activityTier ?? null,
  });

  return {
    row,
    analysis,
    readiness,
    bucket,
    threadAnalysis,
    connectionDegree: row.connectionDegree ?? null,
    rawOutput:
      (rawRefined as Record<string, unknown> | null) ??
      (rawProv as Record<string, unknown> | null),
  };
}

export async function enqueueCleaningReviewForContact(
  contactId: string,
): Promise<void> {
  const ctx = await loadContactContext(contactId);
  if (!ctx?.bucket || !QUEUE_BUCKETS.has(ctx.bucket)) {
    throw new Error("Contact is not in an actionable bucket.");
  }

  const { bucket, analysis, threadAnalysis } = ctx;
  const suggestedAction = bucketSuggestedQueueText(
    bucket,
    analysis,
    threadAnalysis,
    ctx.row.connectionDegree,
  );
  const priority = bucketQueuePriority(bucket);
  const kind = bucket === "reach_out_dm" ? "outreach_prep" : "review";

  const db = getDb();
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

export async function dismissCleaningContact(contactId: string): Promise<void> {
  tryUpdateCleaningDismissedAt(contactId, true);
  const db = getDb();
  const pending = await db.query.actionQueue.findFirst({
    where: and(
      eq(actionQueue.contactId, contactId),
      eq(actionQueue.status, "pending"),
    ),
  });
  if (pending) {
    await db
      .update(actionQueue)
      .set({ status: "dismissed", reviewedAt: new Date() })
      .where(eq(actionQueue.id, pending.id));
  }
}

export async function deferCleaningContact(contactId: string): Promise<void> {
  const db = getDb();
  const pending = await db.query.actionQueue.findFirst({
    where: and(
      eq(actionQueue.contactId, contactId),
      eq(actionQueue.status, "pending"),
    ),
  });
  if (!pending) throw new Error("No pending queue item.");
  await db
    .update(actionQueue)
    .set({ status: "deferred", reviewedAt: null })
    .where(eq(actionQueue.id, pending.id));
}

export async function overrideCleaningBucket(
  contactId: string,
  bucket: CleaningBucket,
): Promise<void> {
  if (!isCleaningBucket(bucket)) throw new Error("Invalid bucket.");
  tryUpdateCleaningUserBucket(contactId, bucket);
  tryUpdateCleaningDismissedAt(contactId, false);
}

export async function enqueueEngageForContact(
  contactId: string,
): Promise<void> {
  const ctx = await loadContactContext(contactId);
  if (!ctx) throw new Error("Contact not found.");

  const playbook = buildContactPlaybookFromAnalysis({
    analysis: ctx.analysis,
    rawOutput: ctx.rawOutput,
    threadAnalysis: ctx.threadAnalysis,
  });

  const generated = await generateEngageCommentForContact(contactId);
  if (!generated.ok) {
    throw new Error(
      generated.error ||
        "Could not generate a tailored comment. Check Settings → Inference.",
    );
  }

  await enqueueCleaningExec({
    contactId,
    kind: "engage",
    payload: {
      suggestedComment: generated.comment,
      commentAngle:
        playbook?.posts_signals?.suggested_comment_angle?.trim() ?? null,
      engagementHook: playbook?.posts_signals?.engagement_hook?.trim() ?? null,
      playbook: playbook?.playbook?.trim() ?? null,
      rationale: playbook?.rationale?.trim() ?? null,
    },
  });
}

export type CleaningAcceptEffect =
  | "removal_exec"
  | "engage_exec"
  | "review_queue"
  | "not_first_degree";

export async function acceptCleaningContact(
  contactId: string,
): Promise<CleaningAcceptEffect> {
  const ctx = await loadContactContext(contactId);
  if (!ctx?.bucket || !QUEUE_BUCKETS.has(ctx.bucket)) {
    throw new Error("Contact is not in an actionable bucket.");
  }

  if (ctx.bucket === "review_remove") {
    if (!cleaningCanDisconnect(ctx.connectionDegree)) {
      await dismissCleaningContact(contactId);
      return "not_first_degree";
    }
    const rationale = bucketSuggestedQueueText(
      ctx.bucket,
      ctx.analysis,
      ctx.threadAnalysis,
      ctx.connectionDegree,
    );
    await approveRemovalForContact(contactId, rationale);
    await dismissCleaningContact(contactId);
    return "removal_exec";
  }

  if (ctx.bucket === "engage_comment") {
    await enqueueEngageForContact(contactId);
    await dismissCleaningContact(contactId);
    return "engage_exec";
  }

  await enqueueCleaningReviewForContact(contactId);
  await dismissCleaningContact(contactId);
  return "review_queue";
}

export type CleaningBatchAction =
  | "accept"
  | "override"
  | "dismiss"
  | "defer"
  | "enqueue_review"
  | "enqueue_engage"
  | "approve_removal"
  | "confirm_disconnected";

export type CleaningBatchResult =
  | { contactId: string; ok: true; effect?: CleaningAcceptEffect }
  | { contactId: string; ok: false; error: string };

export async function runCleaningBatchAction(opts: {
  contactIds: string[];
  action: CleaningBatchAction;
  bucket?: CleaningBucket;
}): Promise<CleaningBatchResult[]> {
  const results: CleaningBatchResult[] = [];

  for (const contactId of opts.contactIds) {
    try {
      switch (opts.action) {
        case "accept": {
          const effect = await acceptCleaningContact(contactId);
          results.push({ contactId, ok: true, effect });
          continue;
        }
        case "enqueue_review":
          await enqueueCleaningReviewForContact(contactId);
          break;
        case "override":
          if (!opts.bucket) throw new Error("bucket required for override.");
          await overrideCleaningBucket(contactId, opts.bucket);
          break;
        case "dismiss":
          await dismissCleaningContact(contactId);
          break;
        case "defer":
          await deferCleaningContact(contactId);
          break;
        case "enqueue_engage":
          await enqueueEngageForContact(contactId);
          await dismissCleaningContact(contactId);
          break;
        case "approve_removal": {
          const ctx = await loadContactContext(contactId);
          if (!ctx || ctx.bucket !== "review_remove") {
            throw new Error("Contact is not in review_remove bucket.");
          }
          if (!cleaningCanDisconnect(ctx.connectionDegree)) {
            throw new Error(
              "Not a 1st-degree connection. LinkedIn disconnect is only for 1st.",
            );
          }
          await approveRemovalForContact(
            contactId,
            "Approved from network hygiene pipeline.",
          );
          break;
        }
        case "confirm_disconnected":
          await confirmContactDisconnected(contactId);
          break;
        default:
          throw new Error("Unknown action.");
      }
      results.push({ contactId, ok: true });
    } catch (e) {
      results.push({
        contactId,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return results;
}
