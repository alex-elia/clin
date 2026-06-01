import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { contacts } from "@/db/schema";
import {
  CLEANING_BUCKETS,
  resolveCleaningBucket,
  type CleaningBucket,
} from "@/lib/cleaningBuckets";
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

function buildCard(
  row: typeof contacts.$inferSelect,
  readiness: ContactReadiness,
  analysis: LlmAnalysisView | null,
  hasLlm: boolean,
): CleaningContactCard {
  const bucket = resolveCleaningBucket({
    readiness,
    analysis,
    segment: row.segment,
    hasLlmAnalysis: hasLlm,
  });
  return {
    contactId: row.id,
    fullName: row.fullName,
    headline: row.headline,
    company: row.company,
    linkedinUrl: row.linkedinUrlCanonical,
    segment: row.segment,
    bucket,
    readiness,
    analysis,
    compositeScore: compositeScore(analysis),
  };
}

export async function buildCleaningBoard(opts?: {
  contactLimit?: number;
  perBucketLimit?: number;
}): Promise<CleaningBoardData> {
  const contactLimit = opts?.contactLimit ?? 400;
  const perBucketLimit = opts?.perBucketLimit ?? 40;

  const db = getDb();
  const [rows, pendingLlm, needsProfile, totalRow] = await Promise.all([
    db
      .select()
      .from(contacts)
      .orderBy(desc(contacts.lastUpdatedAt))
      .limit(contactLimit),
    Promise.resolve(countContactsPendingLlmAnalysis()),
    countContactsNeedingProfileCapture(),
    db.select({ id: contacts.id }).from(contacts),
  ]);

  const readinessMap = await assessRecentContactsReadiness(contactLimit);
  const extMap = listContactLlmExtensionsMap(rows.map((r) => r.id));

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
    const analysis = pickLatestAnalysisView(
      parseEnvelope(ext?.llmRefinedJson ?? null),
      parseEnvelope(ext?.llmProvisionalJson ?? null),
    );
    const hasLlm = Boolean(analysis);
    if (hasLlm) analyzedInBoard += 1;

    const card = buildCard(row, readiness, analysis, hasLlm);
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
  };
}
