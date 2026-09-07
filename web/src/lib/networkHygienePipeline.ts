import fs from "node:fs";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { getDb, getSqlite } from "@/db";
import { captureSessions, cleaningExecQueue, contacts } from "@/db/schema";
import { countContactsPendingLlmAnalysis } from "@/lib/autopilot";
import { assessContactReadiness } from "@/lib/contactReadiness";
import { listContactActivityExtensionsMap } from "@/lib/contactActivitySqlExtras";
import { listContactCleaningExtensionsMap } from "@/lib/cleaningSqlExtras";
import { listContactLlmExtensionsMap } from "@/lib/contactSqlExtras";
import { loadLatestProfileCapturesByContactId } from "@/lib/campaignMemberReadiness";
import {
  resolveCleaningBucket,
  type CleaningBucket,
} from "@/lib/cleaningBuckets";
import {
  pickLatestAnalysisView,
  type LlmAnalysisView,
} from "@/lib/contactLlmDisplay";
import { threadSuggestsRemoval } from "@/lib/cleaningThreadHelpers";
import { getLatestThreadAnalysisForContact } from "@/lib/inboxThreadAnalysisStore";
import type { InboxThreadAnalysis } from "@/lib/inboxThreadAnalysisTypes";
import type { ContactReadiness } from "@/lib/contactReadinessShared";
import type { LinkedInActivityTier } from "@/lib/linkedinActivity";
import { resolveDataDirectory } from "@/lib/dataPaths";
import type {
  AdviceConfidence,
  NetworkHygieneActHints,
  NetworkHygieneMetrics,
  NetworkHygieneRow,
  NetworkHygieneSnapshot,
  RemoveVerdict,
  ZombieLevel,
} from "@/lib/networkHygieneTypes";
import { NETWORK_HYGIENE_DEGREES } from "@/lib/networkHygieneTypes";
import {
  isKnownConnectionDegree,
  normalizeConnectionDegree,
} from "@/lib/connectionDegree";

const CONNECTIONS_LIST_URL =
  "https://www.linkedin.com/mynetwork/invite-connect/connections/";
const SNAPSHOT_FILE = "network-hygiene-snapshot.json";
const SNAPSHOT_TTL_MS = 60 * 60 * 1000;

type ContactRow = typeof contacts.$inferSelect;

export type HygieneAssessInput = {
  row: ContactRow;
  readiness: ContactReadiness;
  analysis: LlmAnalysisView | null;
  threadAnalysis: InboxThreadAnalysis | null;
  activityTier: LinkedInActivityTier | null;
  bucket: CleaningBucket | null;
  hasPostsCapture: boolean;
  hasConnectionsListCapture: boolean;
};

function parseEnvelope(raw: string | null): unknown {
  if (!raw?.trim()) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function daysSince(date: Date | null | undefined): number | null {
  if (!date) return null;
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
}

function isKnownDegree(degree: string | null | undefined): boolean {
  return isKnownConnectionDegree(degree);
}

export function computeAdviceConfidence(input: HygieneAssessInput): AdviceConfidence {
  const hasLlm = Boolean(input.analysis);
  const hasDepth =
    input.readiness.hasProfileCapture &&
    (input.hasPostsCapture || input.readiness.hasMessagingCapture);
  if (hasLlm && hasDepth) return "high";
  if (
    input.readiness.hasProfileCapture &&
    (input.activityTier != null ||
      input.threadAnalysis != null ||
      input.row.segment !== "warm")
  ) {
    return "medium";
  }
  return "low";
}

export function assessNetworkHygiene(
  input: HygieneAssessInput,
): Pick<
  NetworkHygieneRow,
  | "zombieLevel"
  | "removeVerdict"
  | "adviceConfidence"
  | "reasons"
  | "canDisconnect"
  | "bucket"
> {
  const { row, readiness, analysis, threadAnalysis, activityTier, bucket } =
    input;
  const reasons: string[] = [];
  const degree =
    normalizeConnectionDegree(row.connectionDegree)?.trim() ?? "";
  const canDisconnect = degree === "1st";
  const confidence = computeAdviceConfidence(input);
  const stewardship = analysis?.stewardship?.recommendation;
  const threadRemoval = threadSuggestsRemoval(threadAnalysis);
  const segment = row.segment;
  const cleanup = row.cleanupScore;
  const relationship = row.relationshipScore;
  const staleDays = daysSince(row.lastSeenAt);

  let zombieLevel: ZombieLevel = "active";

  if (
    segment === "ghost" ||
    segment === "remove_candidate" ||
    threadRemoval ||
    stewardship === "consider_removing" ||
    (activityTier &&
      (activityTier === "lurker" || activityTier === "dormant") &&
      relationship < 40)
  ) {
    zombieLevel = "high";
    if (segment === "ghost" || segment === "remove_candidate") {
      reasons.push(`Segment: ${segment}`);
    }
    if (threadRemoval && threadAnalysis?.thread_stage) {
      reasons.push(`Thread: ${threadAnalysis.thread_stage}`);
    }
    if (stewardship === "consider_removing") {
      reasons.push("LLM stewardship: consider removing");
    }
    if (
      activityTier &&
      (activityTier === "lurker" || activityTier === "dormant") &&
      relationship < 40
    ) {
      reasons.push(`Activity: ${activityTier}, low relationship score`);
    }
  } else if (
    activityTier === "lurker" ||
    activityTier === "dormant" ||
    threadAnalysis?.thread_stage === "cold_no_reply" ||
    cleanup >= 55
  ) {
    zombieLevel = "medium";
    if (activityTier === "lurker" || activityTier === "dormant") {
      reasons.push(`Activity: ${activityTier}`);
    }
    if (threadAnalysis?.thread_stage === "cold_no_reply") {
      reasons.push("Thread: cold_no_reply");
    }
    if (cleanup >= 55) reasons.push(`Cleanup score: ${cleanup}`);
  } else if (
    activityTier === "active" ||
    activityTier === "occasional" ||
    segment === "active" ||
    segment === "warm"
  ) {
    zombieLevel = "active";
    if (activityTier) reasons.push(`Activity: ${activityTier}`);
  } else if (staleDays != null && staleDays > 120) {
    zombieLevel = "low";
    reasons.push("Not captured by Clin in 120+ days");
  }

  let removeVerdict: RemoveVerdict = "no";

  if (!canDisconnect) {
    removeVerdict = "not_applicable";
  } else if (bucket === "review_remove") {
    removeVerdict = "yes";
    reasons.push("Bucket: review_remove");
  } else if (
    segment === "remove_candidate" ||
    threadRemoval ||
    stewardship === "consider_removing"
  ) {
    removeVerdict = "maybe";
    if (segment === "remove_candidate") {
      reasons.push("Segment: remove_candidate (not in review bucket)");
    }
    if (threadRemoval && threadAnalysis?.thread_stage) {
      reasons.push(`Thread: ${threadAnalysis.thread_stage}`);
    }
    if (stewardship === "consider_removing") {
      reasons.push("LLM stewardship: consider removing");
    }
  } else if (
    (zombieLevel === "high" || zombieLevel === "medium") &&
    confidence !== "low"
  ) {
    removeVerdict = "maybe";
  } else if (
    (zombieLevel === "high" || zombieLevel === "medium") &&
    confidence === "low"
  ) {
    removeVerdict = "maybe";
    reasons.push("Provisional — enrich or analyze for stronger signal");
  }

  if (reasons.length === 0 && zombieLevel === "active") {
    reasons.push("No strong removal signals");
  }

  return {
    zombieLevel,
    removeVerdict,
    adviceConfidence: confidence,
    reasons: [...new Set(reasons)].slice(0, 5),
    canDisconnect,
    bucket,
  };
}

type CaptureFlags = {
  any: boolean;
  profile: boolean;
  posts: boolean;
  messaging: boolean;
  connections: boolean;
};

function loadCaptureFlagsMap(
  contactIds: string[],
): Map<string, CaptureFlags> {
  const map = new Map<string, CaptureFlags>();
  for (const id of contactIds) {
    map.set(id, {
      any: false,
      profile: false,
      posts: false,
      messaging: false,
      connections: false,
    });
  }
  if (contactIds.length === 0) return map;
  const placeholders = contactIds.map(() => "?").join(",");
  try {
    const rows = getSqlite()
      .prepare(
        `SELECT contact_id AS contactId, page_type AS pageType, source_url AS sourceUrl
         FROM capture_sessions
         WHERE contact_id IN (${placeholders})`,
      )
      .all(...contactIds) as {
      contactId: string | null;
      pageType: string;
      sourceUrl: string | null;
    }[];
    for (const r of rows) {
      if (!r.contactId) continue;
      const flags = map.get(r.contactId) ?? {
        any: false,
        profile: false,
        posts: false,
        messaging: false,
        connections: false,
      };
      flags.any = true;
      if (r.pageType === "profile") flags.profile = true;
      if (r.pageType === "posts") flags.posts = true;
      if (
        r.pageType === "messaging" ||
        (r.sourceUrl?.includes("/messaging/") ?? false)
      ) {
        flags.messaging = true;
      }
      if (r.pageType === "connections") flags.connections = true;
      map.set(r.contactId, flags);
    }

    const threadRows = getSqlite()
      .prepare(
        `SELECT DISTINCT contact_id AS contactId
         FROM inbox_thread_analysis
         WHERE contact_id IN (${placeholders})`,
      )
      .all(...contactIds) as { contactId: string }[];
    for (const r of threadRows) {
      const flags = map.get(r.contactId);
      if (flags) flags.messaging = true;
    }
  } catch {
    /* ignore */
  }
  return map;
}

function countUnknownDegreeCaptured(): number {
  try {
    const rows = getSqlite()
      .prepare(
        `SELECT c.connection_degree AS degree FROM contacts c
         WHERE EXISTS (SELECT 1 FROM capture_sessions s WHERE s.contact_id = c.id)`,
      )
      .all() as { degree: string | null }[];
    let n = 0;
    for (const r of rows) {
      if (!normalizeConnectionDegree(r.degree)) n += 1;
    }
    return n;
  } catch {
    return 0;
  }
}

function countWithAnyCapture(): number {
  try {
    const row = getSqlite()
      .prepare(
        `SELECT COUNT(DISTINCT contact_id) AS n FROM capture_sessions WHERE contact_id IS NOT NULL`,
      )
      .get() as { n: number } | undefined;
    return Number(row?.n) || 0;
  } catch {
    return 0;
  }
}

function emptyRecord<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((k) => [k, 0])) as Record<T, number>;
}

function inc(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

function snapshotPath(): string {
  return path.join(resolveDataDirectory(), SNAPSHOT_FILE);
}

export function readCachedNetworkHygieneSnapshot(): NetworkHygieneSnapshot | null {
  try {
    const file = snapshotPath();
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, "utf8");
    return JSON.parse(raw) as NetworkHygieneSnapshot;
  } catch {
    return null;
  }
}

function writeCachedSnapshot(snapshot: NetworkHygieneSnapshot): void {
  const file = snapshotPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

export function invalidateNetworkHygieneSnapshot(): void {
  try {
    const file = snapshotPath();
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch {
    /* ignore */
  }
}

export function isSnapshotStale(snapshot: NetworkHygieneSnapshot): boolean {
  const t = Date.parse(snapshot.runAt);
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > SNAPSHOT_TTL_MS;
}

function isSnapshotOutOfSync(snapshot: NetworkHygieneSnapshot): boolean {
  const liveUnknown = countUnknownDegreeCaptured();
  if (liveUnknown !== snapshot.metrics.unknownDegree) return true;
  const expectedScope = Math.max(
    0,
    snapshot.metrics.withAnyCapture - liveUnknown,
  );
  return snapshot.metrics.inPipelineScope !== expectedScope;
}

export async function runNetworkHygienePipeline(): Promise<NetworkHygieneSnapshot> {
  const db = getDb();
  const allContacts = await db.select({ id: contacts.id }).from(contacts);
  const totalContacts = allContacts.length;
  const withAnyCapture = countWithAnyCapture();
  const unknownDegree = countUnknownDegreeCaptured();

  const allContactRows = await db
    .select()
    .from(contacts)
    .orderBy(desc(contacts.cleanupScore), desc(contacts.lastUpdatedAt));

  const captureFlagsAll = loadCaptureFlagsMap(
    allContactRows.map((r) => r.id),
  );

  const scopeRowsFiltered: ContactRow[] = [];
  const scopeIds: string[] = [];
  for (const row of allContactRows) {
    const flags = captureFlagsAll.get(row.id);
    if (!flags?.any) continue;
    if (!isKnownDegree(row.connectionDegree)) continue;
    scopeRowsFiltered.push(row);
    scopeIds.push(row.id);
  }

  const caps = await loadLatestProfileCapturesByContactId(scopeIds);
  const extMap = listContactLlmExtensionsMap(scopeIds);
  const cleaningMap = listContactCleaningExtensionsMap(scopeIds);
  const activityMap = listContactActivityExtensionsMap(scopeIds);
  const captureFlags = loadCaptureFlagsMap(scopeIds);

  const execPending = await db
    .select({ kind: cleaningExecQueue.kind })
    .from(cleaningExecQueue)
    .where(eq(cleaningExecQueue.status, "pending"));
  const removalQueuePending = execPending.filter(
    (r) => r.kind === "removal",
  ).length;

  const metrics: NetworkHygieneMetrics = {
    totalContacts,
    withAnyCapture,
    unknownDegree,
    withConnectionsListCapture: 0,
    inPipelineScope: scopeRowsFiltered.length,
    withProfileCapture: 0,
    withPostsCapture: 0,
    withMessagingCapture: 0,
    withLlmAnalysis: 0,
    adviceConfidenceHigh: 0,
    adviceConfidenceMedium: 0,
    adviceConfidenceLow: 0,
    byConnectionDegree: {},
    byExtractionLevel: {},
    firstDegreeCount: 0,
    bySegment: {},
    removeCandidateCount: 0,
    staleCapture120d: 0,
    highCleanup: 0,
    avgRelationshipScore: 0,
    avgCleanupScore: 0,
    byActivityTier: {},
    activityUnknown: 0,
    lurkerOrDormant: 0,
    activeOrOccasional: 0,
    withThreadAnalysis: 0,
    byThreadStage: {},
    ghostedCount: 0,
    coldNoReplyCount: 0,
    threadSuggestsRemovalCount: 0,
    byStewardship: {},
    byCleaningBucket: {},
    reviewRemoveBucket: 0,
    pendingLlmAnalysis: countContactsPendingLlmAnalysis(),
    removableFirstYes: 0,
    removableFirstMaybe: 0,
    notApplicableDisconnect: 0,
    removalQueuePending,
    byZombieLevel: emptyRecord([
      "high",
      "medium",
      "low",
      "active",
    ] as const),
    byRemoveVerdict: emptyRecord([
      "yes",
      "maybe",
      "no",
      "not_applicable",
    ] as const),
  };

  const rows: NetworkHygieneRow[] = [];
  let sumR = 0;
  let sumC = 0;

  for (const row of scopeRowsFiltered) {
    const flags = captureFlags.get(row.id)!;
    const messaging = flags.messaging;
    const readiness = assessContactReadiness(row, caps, messaging);
    const ext = extMap.get(row.id);
    const rawRefined = parseEnvelope(ext?.llmRefinedJson ?? null);
    const rawProv = parseEnvelope(ext?.llmProvisionalJson ?? null);
    const analysis = pickLatestAnalysisView(rawRefined, rawProv);
    const hasLlm = Boolean(analysis);
    const threadStored = messaging
      ? getLatestThreadAnalysisForContact(row.id)
      : null;
    const threadAnalysis = threadStored?.analysis ?? null;
    const activityExt = activityMap.get(row.id);
    const activityTier = activityExt?.activityTier ?? null;
    const cleaningExt = cleaningMap.get(row.id) ?? {
      cleaningUserBucket: null,
      cleaningDismissedAt: null,
    };
    const bucket = resolveCleaningBucket({
      readiness,
      analysis,
      segment: row.segment,
      hasLlmAnalysis: hasLlm,
      threadAnalysis,
      cleaningUserBucket: cleaningExt.cleaningUserBucket,
      cleaningDismissedAt: cleaningExt.cleaningDismissedAt,
      activityTier,
    });

    const assessInput: HygieneAssessInput = {
      row,
      readiness,
      analysis,
      threadAnalysis,
      activityTier,
      bucket,
      hasPostsCapture: flags.posts,
      hasConnectionsListCapture: flags.connections,
    };
    const assessed = assessNetworkHygiene(assessInput);

    const hygieneRow: NetworkHygieneRow = {
      contactId: row.id,
      fullName: row.fullName,
      headline: row.headline,
      company: row.company,
      linkedinUrl: row.linkedinUrlCanonical,
      connectionDegree:
        normalizeConnectionDegree(row.connectionDegree) ?? row.connectionDegree!.trim(),
      segment: row.segment,
      relationshipScore: row.relationshipScore,
      cleanupScore: row.cleanupScore,
      activityTier,
      extractionLevel: readiness.extractionLevel,
      hasProfileCapture: readiness.hasProfileCapture,
      hasPostsCapture: flags.posts,
      hasMessagingCapture: messaging,
      hasConnectionsListCapture: flags.connections,
      hasLlmAnalysis: hasLlm,
      threadStage: threadAnalysis?.thread_stage ?? null,
      ...assessed,
    };
    rows.push(hygieneRow);

    sumR += row.relationshipScore;
    sumC += row.cleanupScore;
    if (flags.connections) metrics.withConnectionsListCapture += 1;
    if (readiness.hasProfileCapture) metrics.withProfileCapture += 1;
    if (flags.posts) metrics.withPostsCapture += 1;
    if (messaging) metrics.withMessagingCapture += 1;
    if (hasLlm) metrics.withLlmAnalysis += 1;
    if (assessed.adviceConfidence === "high") metrics.adviceConfidenceHigh += 1;
    else if (assessed.adviceConfidence === "medium") {
      metrics.adviceConfidenceMedium += 1;
    } else metrics.adviceConfidenceLow += 1;

    inc(metrics.byConnectionDegree, hygieneRow.connectionDegree);
    inc(metrics.byExtractionLevel, readiness.extractionLevel);
    if (hygieneRow.connectionDegree === "1st") metrics.firstDegreeCount += 1;
    inc(metrics.bySegment, row.segment);
    if (row.segment === "remove_candidate" || row.cleanupScore >= 70) {
      metrics.removeCandidateCount += 1;
    }
    const stale = daysSince(row.lastSeenAt);
    if (stale != null && stale > 120) metrics.staleCapture120d += 1;
    if (row.cleanupScore >= 55) metrics.highCleanup += 1;

    const tierKey = activityTier ?? "unknown";
    inc(metrics.byActivityTier, tierKey);
    if (!activityTier || tierKey === "unknown") metrics.activityUnknown += 1;
    if (activityTier === "lurker" || activityTier === "dormant") {
      metrics.lurkerOrDormant += 1;
    }
    if (activityTier === "active" || activityTier === "occasional") {
      metrics.activeOrOccasional += 1;
    }

    if (threadAnalysis) {
      metrics.withThreadAnalysis += 1;
      if (threadAnalysis.thread_stage) {
        inc(metrics.byThreadStage, threadAnalysis.thread_stage);
      }
      if (threadAnalysis.thread_stage === "ghosted") metrics.ghostedCount += 1;
      if (threadAnalysis.thread_stage === "cold_no_reply") {
        metrics.coldNoReplyCount += 1;
      }
      if (threadSuggestsRemoval(threadAnalysis)) {
        metrics.threadSuggestsRemovalCount += 1;
      }
    }

    const stew = analysis?.stewardship?.recommendation ?? "none";
    inc(metrics.byStewardship, stew);
    if (bucket) {
      inc(metrics.byCleaningBucket, bucket);
      if (bucket === "review_remove") metrics.reviewRemoveBucket += 1;
    }

    metrics.byZombieLevel[assessed.zombieLevel] += 1;
    metrics.byRemoveVerdict[assessed.removeVerdict] += 1;

    if (assessed.removeVerdict === "yes" && assessed.canDisconnect) {
      metrics.removableFirstYes += 1;
    }
    if (assessed.removeVerdict === "maybe" && assessed.canDisconnect) {
      metrics.removableFirstMaybe += 1;
    }
    if (assessed.removeVerdict === "not_applicable") {
      metrics.notApplicableDisconnect += 1;
    }
  }

  if (scopeRowsFiltered.length > 0) {
    metrics.avgRelationshipScore = Math.round(
      sumR / scopeRowsFiltered.length,
    );
    metrics.avgCleanupScore = Math.round(sumC / scopeRowsFiltered.length);
  }

  const zombieOrder: Record<ZombieLevel, number> = {
    high: 4,
    medium: 3,
    low: 2,
    active: 1,
  };
  rows.sort((a, b) => {
    const z = zombieOrder[b.zombieLevel] - zombieOrder[a.zombieLevel];
    if (z !== 0) return z;
    return b.cleanupScore - a.cleanupScore;
  });

  const topRemovalCandidates = rows
    .filter((r) => r.removeVerdict === "yes" && r.canDisconnect)
    .slice(0, 10);

  let analyzeGapCount = 0;
  let enrichProfileCount = 0;
  let capturePostsCount = 0;
  let captureMessagingCount = 0;
  for (const r of rows) {
    if (!r.hasLlmAnalysis && r.hasProfileCapture) analyzeGapCount += 1;
    if (r.extractionLevel === "list_only") enrichProfileCount += 1;
    if (!r.hasPostsCapture) capturePostsCount += 1;
    if (r.connectionDegree === "1st" && !r.hasMessagingCapture) {
      captureMessagingCount += 1;
    }
  }

  const actHints: NetworkHygieneActHints = {
    syncConnectionsList:
      unknownDegree > 0 &&
      (unknownDegree >= 5 || unknownDegree / Math.max(withAnyCapture, 1) > 0.1),
    analyzeGapCount,
    enrichProfileCount,
    capturePostsCount,
    captureMessagingCount,
    queueRemovalYesCount: metrics.removableFirstYes,
    queueRemovalMaybeCount: metrics.removableFirstMaybe,
    connectionsListUrl: CONNECTIONS_LIST_URL,
  };

  const snapshot: NetworkHygieneSnapshot = {
    runAt: new Date().toISOString(),
    metrics,
    rows,
    topRemovalCandidates,
    actHints,
  };

  writeCachedSnapshot(snapshot);
  return snapshot;
}

export async function getNetworkHygieneSnapshot(opts?: {
  refresh?: boolean;
}): Promise<NetworkHygieneSnapshot> {
  if (!opts?.refresh) {
    const cached = readCachedNetworkHygieneSnapshot();
    if (
      cached &&
      !isSnapshotStale(cached) &&
      !isSnapshotOutOfSync(cached)
    ) {
      return cached;
    }
  }
  return runNetworkHygienePipeline();
}

export async function assessContactNetworkHygiene(
  contactId: string,
): Promise<NetworkHygieneRow | null> {
  const db = getDb();
  const row = await db.query.contacts.findFirst({
    where: eq(contacts.id, contactId),
  });
  if (!row) return null;
  const flags = loadCaptureFlagsMap([contactId]).get(contactId);
  if (!flags?.any || !isKnownDegree(row.connectionDegree)) return null;

  const caps = await loadLatestProfileCapturesByContactId([contactId]);
  const ext = listContactLlmExtensionsMap([contactId]).get(contactId);
  const analysis = pickLatestAnalysisView(
    parseEnvelope(ext?.llmRefinedJson ?? null),
    parseEnvelope(ext?.llmProvisionalJson ?? null),
  );
  const messaging = flags.messaging;
  const readiness = assessContactReadiness(row, caps, messaging);
  const threadAnalysis = messaging
    ? (getLatestThreadAnalysisForContact(contactId)?.analysis ?? null)
    : null;
  const activityTier =
    listContactActivityExtensionsMap([contactId]).get(contactId)?.activityTier ??
    null;
  const cleaningExt = listContactCleaningExtensionsMap([contactId]).get(
    contactId,
  ) ?? { cleaningUserBucket: null, cleaningDismissedAt: null };
  const bucket = resolveCleaningBucket({
    readiness,
    analysis,
    segment: row.segment,
    hasLlmAnalysis: Boolean(analysis),
    threadAnalysis,
    cleaningUserBucket: cleaningExt.cleaningUserBucket,
    cleaningDismissedAt: cleaningExt.cleaningDismissedAt,
    activityTier,
  });
  const assessed = assessNetworkHygiene({
    row,
    readiness,
    analysis,
    threadAnalysis,
    activityTier,
    bucket,
    hasPostsCapture: flags.posts,
    hasConnectionsListCapture: flags.connections,
  });
  return {
    contactId: row.id,
    fullName: row.fullName,
    headline: row.headline,
    company: row.company,
    linkedinUrl: row.linkedinUrlCanonical,
    connectionDegree:
      normalizeConnectionDegree(row.connectionDegree) ??
      row.connectionDegree!.trim(),
    segment: row.segment,
    relationshipScore: row.relationshipScore,
    cleanupScore: row.cleanupScore,
    activityTier,
    extractionLevel: readiness.extractionLevel,
    hasProfileCapture: readiness.hasProfileCapture,
    hasPostsCapture: flags.posts,
    hasMessagingCapture: messaging,
    hasConnectionsListCapture: flags.connections,
    hasLlmAnalysis: Boolean(analysis),
    threadStage: threadAnalysis?.thread_stage ?? null,
    ...assessed,
  };
}
