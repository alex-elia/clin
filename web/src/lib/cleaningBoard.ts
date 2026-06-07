import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { actionQueue, cleaningExecQueue, contacts } from "@/db/schema";
import {
  CLEANING_BUCKETS,
  resolveCleaningBucket,
  type CleaningBucket,
} from "@/lib/cleaningBuckets";
import { buildContactPlaybookFromAnalysis } from "@/lib/contactPlaybook";
import {
  pickLatestAnalysisView,
  type LlmAnalysisView,
} from "@/lib/contactLlmDisplay";
import {
  assessContactReadiness,
  assessRecentContactsReadiness,
  type ContactReadiness,
} from "@/lib/contactReadiness";
import type {
  CleaningBoardData,
  CleaningContactCard,
} from "@/lib/cleaningBoardTypes";
import { listContactLlmExtensionsMap } from "@/lib/contactSqlExtras";
import { listContactCleaningExtensionsMap } from "@/lib/cleaningSqlExtras";
import { countContactsPendingLlmAnalysis } from "@/lib/autopilot";
import { countContactsNeedingProfileCapture } from "@/lib/enrichment";

export type {
  CleaningBoardData,
  CleaningBoardSummary,
  CleaningContactCard,
} from "@/lib/cleaningBoardTypes";

function parseEnvelope(raw: string | null): unknown {
  if (!raw?.trim()) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function compositeScore(view: LlmAnalysisView | null): number | null {
  const s = view?.modelScores;
  if (!s) return null;
  return Math.round((s.r + s.b + (100 - s.c)) / 3);
}

function resolveAiBucket(input: {
  readiness: ContactReadiness;
  analysis: LlmAnalysisView | null;
  segment: string;
  hasLlm: boolean;
}): CleaningBucket | null {
  return resolveCleaningBucket({
    readiness: input.readiness,
    analysis: input.analysis,
    segment: input.segment,
    hasLlmAnalysis: input.hasLlm,
    cleaningUserBucket: null,
    cleaningDismissedAt: null,
  });
}

function buildCard(
  row: typeof contacts.$inferSelect,
  readiness: ContactReadiness,
  analysis: LlmAnalysisView | null,
  hasLlm: boolean,
  cleaningExt: {
    cleaningUserBucket: CleaningBucket | null;
    cleaningDismissedAt: number | null;
  },
  queueId: string | null,
  rawOutput: Record<string, unknown> | null,
): CleaningContactCard | null {
  const aiBucket = resolveAiBucket({
    readiness,
    analysis,
    segment: row.segment,
    hasLlm,
  });
  const bucket = resolveCleaningBucket({
    readiness,
    analysis,
    segment: row.segment,
    hasLlmAnalysis: hasLlm,
    cleaningUserBucket: cleaningExt.cleaningUserBucket,
    cleaningDismissedAt: cleaningExt.cleaningDismissedAt,
  });
  if (!bucket) return null;

  const playbook = buildContactPlaybookFromAnalysis({
    analysis,
    rawOutput,
  });

  return {
    contactId: row.id,
    fullName: row.fullName,
    headline: row.headline,
    company: row.company,
    linkedinUrl: row.linkedinUrlCanonical,
    segment: row.segment,
    bucket,
    aiBucket,
    userOverrideBucket: cleaningExt.cleaningUserBucket,
    readiness,
    analysis,
    playbook,
    compositeScore: compositeScore(analysis),
    queueId,
  };
}

export async function buildCleaningBoard(opts?: {
  contactLimit?: number;
  perBucketLimit?: number;
}): Promise<CleaningBoardData> {
  const contactLimit = opts?.contactLimit ?? 400;
  const perBucketLimit = opts?.perBucketLimit ?? 40;

  const db = getDb();
  const [rows, pendingLlm, needsProfile, totalRow, execRows] = await Promise.all([
    db
      .select()
      .from(contacts)
      .orderBy(desc(contacts.lastUpdatedAt))
      .limit(contactLimit),
    Promise.resolve(countContactsPendingLlmAnalysis()),
    countContactsNeedingProfileCapture(),
    db.select({ id: contacts.id }).from(contacts),
    db
      .select({ kind: cleaningExecQueue.kind, status: cleaningExecQueue.status })
      .from(cleaningExecQueue)
      .where(eq(cleaningExecQueue.status, "pending")),
  ]);

  const readinessMap = await assessRecentContactsReadiness(contactLimit);
  const contactIds = rows.map((r) => r.id);
  const extMap = listContactLlmExtensionsMap(contactIds);
  const cleaningMap = listContactCleaningExtensionsMap(contactIds);

  const pendingQueues = await db.query.actionQueue.findMany({
    where: and(eq(actionQueue.status, "pending")),
  });
  const queueByContact = new Map(
    pendingQueues.map((q) => [q.contactId, q.id]),
  );

  const byBucket = Object.fromEntries(
    CLEANING_BUCKETS.map((b) => [b, [] as CleaningContactCard[]]),
  ) as Record<CleaningBucket, CleaningContactCard[]>;

  const bucketCounts = Object.fromEntries(
    CLEANING_BUCKETS.map((b) => [b, 0]),
  ) as Record<CleaningBucket, number>;

  let readyForAnalysis = 0;
  let readyForDecisions = 0;
  let analyzedInBoard = 0;

  for (const row of rows) {
    const readiness =
      readinessMap.get(row.id) ??
      assessContactReadiness(row, new Map(), false);
    if (readiness.readyForAnalysis) readyForAnalysis += 1;
    if (readiness.readyForDecisions) readyForDecisions += 1;

    const ext = extMap.get(row.id);
    const rawRefined = parseEnvelope(ext?.llmRefinedJson ?? null);
    const rawProv = parseEnvelope(ext?.llmProvisionalJson ?? null);
    const analysis = pickLatestAnalysisView(rawRefined, rawProv);
    const hasLlm = Boolean(analysis);
    if (hasLlm) analyzedInBoard += 1;

    const cleaningExt = cleaningMap.get(row.id) ?? {
      cleaningUserBucket: null,
      cleaningDismissedAt: null,
    };
    const rawOutput =
      (rawRefined as Record<string, unknown> | null) ??
      (rawProv as Record<string, unknown> | null);

    const card = buildCard(
      row,
      readiness,
      analysis,
      hasLlm,
      cleaningExt,
      queueByContact.get(row.id) ?? null,
      rawOutput,
    );
    if (!card) continue;

    bucketCounts[card.bucket] += 1;
    if (byBucket[card.bucket].length < perBucketLimit) {
      byBucket[card.bucket].push(card);
    }
  }

  for (const bucket of CLEANING_BUCKETS) {
    byBucket[bucket].sort((a, b) => {
      const sa = a.compositeScore ?? -1;
      const sb = b.compositeScore ?? -1;
      return sb - sa;
    });
  }

  let removalPending = 0;
  let engagePending = 0;
  for (const r of execRows) {
    if (r.kind === "removal") removalPending += 1;
    if (r.kind === "engage") engagePending += 1;
  }

  return {
    summary: {
      totalContacts: totalRow.length,
      readyForAnalysis,
      readyForDecisions,
      pendingLlmAnalysis: pendingLlm,
      needsProfileCapture: needsProfile,
      analyzedInBoard,
      bucketCounts,
    },
    byBucket,
    execCounts: { removalPending, engagePending },
  };
}

export function collectEngageContactIds(
  byBucket: Record<CleaningBucket, CleaningContactCard[]>,
  limit = 30,
): string[] {
  return (byBucket.engage_comment ?? [])
    .slice(0, limit)
    .map((c) => c.contactId);
}
