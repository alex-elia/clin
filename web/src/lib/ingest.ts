import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  actionQueue,
  captureSessions,
  contactSnapshots,
  contacts,
} from "@/db/schema";
import * as schema from "@/db/schema";
import type { getDb } from "@/db";
import { normalizeExtractedPersonFields } from "@/lib/linkedinNormalize";
import { canonicalizeLinkedInUrl, normalizeCompany } from "@/lib/url";
import { SCORE_RULE_VERSION, scoreContact } from "@/lib/scoring";

type Db = ReturnType<typeof getDb>;
type DbClient = BetterSQLite3Database<typeof schema>;
type ContactRow = typeof contacts.$inferSelect;

const ALLOWED_SCHEMA = new Set(["1"]);

export type IngestInput = {
  schemaVersion: string;
  pageType: string;
  sourceUrl: string;
  capturedAt?: string;
  confidence?: number;
  extractedFields: {
    fullName?: string;
    headline?: string;
    company?: string;
    location?: string;
    connectionDegree?: string;
    about?: string;
    experienceBullets?: string[];
    educationBullets?: string[];
    messagingParticipantProfileUrl?: string;
    messagingThreadId?: string;
    messagingParticipantName?: string;
    messagingMessages?: { from: "me" | "them" | "unknown"; body: string }[];
  };
  fieldPresence?: Record<string, boolean>;
};

export type ConnectionRowInput = {
  profileUrl: string;
  fullName?: string;
  headline?: string;
  company?: string;
  location?: string;
  connectionDegree?: string;
};

export type ConnectionsPageInput = {
  schemaVersion: string;
  pageType: "connections";
  listSourceUrl: string;
  capturedAt?: string;
  rows: ConnectionRowInput[];
};

function buildMergedAndScores(
  canonical: string,
  rawUrl: string,
  extractedFields: IngestInput["extractedFields"],
  existing: ContactRow | undefined,
  now: Date,
): {
  merged: Partial<typeof contacts.$inferInsert>;
  scores: ReturnType<typeof scoreContact>;
} {
  const companyNorm = normalizeCompany(extractedFields.company);
  const merged: Partial<typeof contacts.$inferInsert> = {
    linkedinUrlCanonical: canonical,
    linkedinUrlRaw: rawUrl,
    fullName: extractedFields.fullName ?? existing?.fullName ?? null,
    headline: extractedFields.headline ?? existing?.headline ?? null,
    company: extractedFields.company ?? existing?.company ?? null,
    companyNormalized: companyNorm ?? existing?.companyNormalized ?? null,
    location: extractedFields.location ?? existing?.location ?? null,
    connectionDegree:
      extractedFields.connectionDegree ?? existing?.connectionDegree ?? null,
    lastSeenAt: now,
    lastUpdatedAt: now,
  };
  const baseForScore: Partial<ContactRow> = {
    ...(existing ?? {}),
    ...merged,
    lastSeenAt: now,
  };
  const scores = scoreContact(baseForScore);
  return { merged, scores };
}

function syncPersistContact(
  tx: DbClient,
  p: {
    now: Date;
    schemaVersion: string;
    pageType: string;
    captureSourceUrl: string;
    confidence: number | null;
    fieldPresence: Record<string, boolean> | null;
    extractedJson: Record<string, unknown>;
    existing: ContactRow | undefined;
    merged: Partial<typeof contacts.$inferInsert>;
    scores: ReturnType<typeof scoreContact>;
  },
): "created" | "updated" {
  const captureId = crypto.randomUUID();
  const snapshotId = crypto.randomUUID();

  if (p.existing) {
    tx
      .update(contacts)
      .set({
        ...p.merged,
        segment: p.scores.segment,
        relationshipScore: p.scores.relationshipScore,
        businessScore: p.scores.businessScore,
        cleanupScore: p.scores.cleanupScore,
        relationshipReasons: JSON.stringify(p.scores.relationshipReasons),
        businessReasons: JSON.stringify(p.scores.businessReasons),
        cleanupReasons: JSON.stringify(p.scores.cleanupReasons),
        scoreRuleVersion: SCORE_RULE_VERSION,
        lastSeenAt: p.now,
        lastUpdatedAt: p.now,
      })
      .where(eq(contacts.id, p.existing.id))
      .run();

    tx
      .insert(captureSessions)
      .values({
        id: captureId,
        contactId: p.existing.id,
        schemaVersion: p.schemaVersion,
        pageType: p.pageType,
        sourceUrl: p.captureSourceUrl,
        confidence: p.confidence,
        fieldPresence: p.fieldPresence,
        extractedJson: p.extractedJson,
        capturedAt: p.now,
      })
      .run();

    tx
      .insert(contactSnapshots)
      .values({
        id: snapshotId,
        contactId: p.existing.id,
        capturedAt: p.now,
        snapshotJson: {
          ...p.extractedJson,
          segment: p.scores.segment,
          scores: {
            relationship: p.scores.relationshipScore,
            business: p.scores.businessScore,
            cleanup: p.scores.cleanupScore,
          },
        },
      })
      .run();

    maybeEnqueue(tx, p.existing.id, p.scores.segment);
    return "updated";
  }

  const id = crypto.randomUUID();
  tx
    .insert(contacts)
    .values({
      id,
      linkedinUrlCanonical: p.merged.linkedinUrlCanonical!,
      linkedinUrlRaw: p.merged.linkedinUrlRaw ?? null,
      fullName: p.merged.fullName ?? null,
      headline: p.merged.headline ?? null,
      company: p.merged.company ?? null,
      companyNormalized: p.merged.companyNormalized ?? null,
      location: p.merged.location ?? null,
      connectionDegree: p.merged.connectionDegree ?? null,
      segment: p.scores.segment,
      relationshipScore: p.scores.relationshipScore,
      businessScore: p.scores.businessScore,
      cleanupScore: p.scores.cleanupScore,
      relationshipReasons: JSON.stringify(p.scores.relationshipReasons),
      businessReasons: JSON.stringify(p.scores.businessReasons),
      cleanupReasons: JSON.stringify(p.scores.cleanupReasons),
      scoreRuleVersion: SCORE_RULE_VERSION,
      lastSeenAt: p.now,
      lastUpdatedAt: p.now,
      createdAt: p.now,
    })
    .run();

  tx
    .insert(captureSessions)
    .values({
      id: captureId,
      contactId: id,
      schemaVersion: p.schemaVersion,
      pageType: p.pageType,
      sourceUrl: p.captureSourceUrl,
      confidence: p.confidence,
      fieldPresence: p.fieldPresence,
      extractedJson: p.extractedJson,
      capturedAt: p.now,
    })
    .run();

  tx
    .insert(contactSnapshots)
    .values({
      id: snapshotId,
      contactId: id,
      capturedAt: p.now,
      snapshotJson: {
        ...p.extractedJson,
        segment: p.scores.segment,
        scores: {
          relationship: p.scores.relationshipScore,
          business: p.scores.businessScore,
          cleanup: p.scores.cleanupScore,
        },
      },
    })
    .run();

  maybeEnqueue(tx, id, p.scores.segment);
  return "created";
}

export async function ingestCapture(db: Db, input: IngestInput) {
  if (!ALLOWED_SCHEMA.has(input.schemaVersion)) {
    throw new Error(`Unsupported schemaVersion: ${input.schemaVersion}`);
  }

  if (input.pageType === "messaging") {
    return ingestMessagingCapture(db, input);
  }

  const canonical = canonicalizeLinkedInUrl(input.sourceUrl);
  if (!canonical) {
    throw new Error("Could not derive canonical LinkedIn URL from sourceUrl");
  }

  const now = input.capturedAt ? new Date(input.capturedAt) : new Date();

  const existing = await db.query.contacts.findFirst({
    where: eq(contacts.linkedinUrlCanonical, canonical),
  });

  const normalizedFields = normalizeExtractedPersonFields(input.extractedFields);
  const extractedFields = {
    ...input.extractedFields,
    ...normalizedFields,
  };

  const { merged, scores } = buildMergedAndScores(
    canonical,
    input.sourceUrl,
    extractedFields,
    existing,
    now,
  );

  const fieldPresence = {
    fullName: Boolean(extractedFields.fullName),
    headline: Boolean(extractedFields.headline),
    company: Boolean(extractedFields.company),
    location: Boolean(extractedFields.location),
  };
  const confidence =
    Object.values(fieldPresence).filter(Boolean).length / 4;
  const extractedJson = extractedFields as Record<string, unknown>;

  db.transaction((tx) => {
    syncPersistContact(tx, {
      now,
      schemaVersion: input.schemaVersion,
      pageType: input.pageType,
      captureSourceUrl: input.sourceUrl,
      confidence,
      fieldPresence: fieldPresence as Record<string, boolean>,
      extractedJson,
      existing,
      merged,
      scores,
    });
  });

  const row = await db.query.contacts.findFirst({
    where: eq(contacts.linkedinUrlCanonical, canonical),
  });

  return { contactId: row!.id, canonicalUrl: canonical, scores };
}

async function ingestMessagingCapture(db: Db, input: IngestInput) {
  const purl = input.extractedFields.messagingParticipantProfileUrl?.trim();
  if (!purl) {
    throw new Error(
      "Messaging capture requires messagingParticipantProfileUrl (their /in/… link).",
    );
  }
  const canonical = canonicalizeLinkedInUrl(purl);
  if (!canonical || !isProfileCanonicalUrl(canonical)) {
    throw new Error("Could not parse participant profile URL.");
  }

  const now = input.capturedAt ? new Date(input.capturedAt) : new Date();
  const existing = await db.query.contacts.findFirst({
    where: eq(contacts.linkedinUrlCanonical, canonical),
  });

  const participantName =
    input.extractedFields.messagingParticipantName?.trim() || undefined;
  const extractedFields = {
    messagingParticipantProfileUrl: canonical,
    messagingThreadId: input.extractedFields.messagingThreadId,
    messagingParticipantName: participantName,
    messagingMessages: input.extractedFields.messagingMessages ?? [],
  };

  const fieldPresence = {
    messagingParticipantProfileUrl: true,
    messagingMessages: Boolean(extractedFields.messagingMessages.length > 0),
  };
  const confidence =
    input.confidence ??
    (extractedFields.messagingMessages.length >= 3 ? 0.85 : 0.65);

  const merged: Partial<typeof contacts.$inferInsert> = {
    linkedinUrlCanonical: canonical,
    linkedinUrlRaw: purl,
    fullName: participantName ?? existing?.fullName ?? null,
    lastSeenAt: now,
    lastUpdatedAt: now,
  };

  const baseForScore: Partial<ContactRow> = {
    ...(existing ?? {}),
    ...merged,
    lastSeenAt: now,
  };
  const scores = scoreContact(baseForScore);

  db.transaction((tx) => {
    syncPersistContact(tx, {
      now,
      schemaVersion: input.schemaVersion,
      pageType: "messaging",
      captureSourceUrl: input.sourceUrl,
      confidence,
      fieldPresence,
      extractedJson: extractedFields as Record<string, unknown>,
      existing,
      merged,
      scores,
    });
  });

  const row = await db.query.contacts.findFirst({
    where: eq(contacts.linkedinUrlCanonical, canonical),
  });

  return { contactId: row!.id, canonicalUrl: canonical, scores };
}

/** Dedupe by canonical profile URL; skips non-/in/ profile URLs. */
export function dedupeConnectionRows(rows: ConnectionRowInput[]): ConnectionRowInput[] {
  const seen = new Set<string>();
  const out: ConnectionRowInput[] = [];
  for (const row of rows) {
    const c = canonicalizeLinkedInUrl(row.profileUrl);
    if (!c || !isProfileCanonicalUrl(c)) continue;
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(row);
  }
  return out;
}

function isProfileCanonicalUrl(canonical: string): boolean {
  try {
    const u = new URL(canonical);
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[0] === "in" && Boolean(parts[1]);
  } catch {
    return false;
  }
}

/**
 * Find or create a minimal contact row from a profile URL (no capture session).
 * Visible-field extraction still requires the extension on an open LinkedIn tab.
 */
export async function ensureContactStubFromProfileUrl(
  db: Db,
  rawUrl: string,
): Promise<{
  contactId: string;
  canonicalUrl: string;
  created: boolean;
}> {
  const canonical = canonicalizeLinkedInUrl(rawUrl.trim());
  if (!canonical) {
    throw new Error("Could not parse that as a LinkedIn URL.");
  }
  if (!isProfileCanonicalUrl(canonical)) {
    throw new Error(
      "Use a profile link that contains /in/… (e.g. https://www.linkedin.com/in/your-handle).",
    );
  }

  const existing = await db.query.contacts.findFirst({
    where: eq(contacts.linkedinUrlCanonical, canonical),
  });
  if (existing) {
    return {
      contactId: existing.id,
      canonicalUrl: canonical,
      created: false,
    };
  }

  const now = new Date();
  const { merged, scores } = buildMergedAndScores(
    canonical,
    rawUrl.trim(),
    {},
    undefined,
    now,
  );
  const id = crypto.randomUUID();

  db.transaction((tx) => {
    tx.insert(contacts)
      .values({
        id,
        linkedinUrlCanonical: merged.linkedinUrlCanonical!,
        linkedinUrlRaw: merged.linkedinUrlRaw ?? null,
        fullName: null,
        headline: null,
        company: null,
        companyNormalized: null,
        location: null,
        connectionDegree: null,
        segment: scores.segment,
        relationshipScore: scores.relationshipScore,
        businessScore: scores.businessScore,
        cleanupScore: scores.cleanupScore,
        relationshipReasons: JSON.stringify(scores.relationshipReasons),
        businessReasons: JSON.stringify(scores.businessReasons),
        cleanupReasons: JSON.stringify(scores.cleanupReasons),
        scoreRuleVersion: SCORE_RULE_VERSION,
        lastSeenAt: now,
        lastUpdatedAt: now,
        createdAt: now,
      })
      .run();
    maybeEnqueue(tx, id, scores.segment);
  });

  return { contactId: id, canonicalUrl: canonical, created: true };
}

export async function ingestConnectionsPage(
  db: Db,
  input: ConnectionsPageInput,
  options?: { maxRows?: number; limit?: number },
) {
  if (!ALLOWED_SCHEMA.has(input.schemaVersion)) {
    throw new Error(`Unsupported schemaVersion: ${input.schemaVersion}`);
  }

  const maxRows = Math.min(options?.maxRows ?? 200, 200);
  const now = input.capturedAt ? new Date(input.capturedAt) : new Date();
  const uniqueRows = dedupeConnectionRows(input.rows);
  const lim = Math.min(
    options?.limit ?? uniqueRows.length,
    maxRows,
    uniqueRows.length,
  );
  const toProcess = uniqueRows.slice(0, lim);

  let created = 0;
  let updated = 0;

  db.transaction((tx) => {
    for (const row of toProcess) {
      const canonical = canonicalizeLinkedInUrl(row.profileUrl);
      if (!canonical || !isProfileCanonicalUrl(canonical)) {
        continue;
      }

      const normalized = normalizeExtractedPersonFields({
        fullName: row.fullName,
        headline: row.headline,
        company: row.company,
        location: row.location,
      });
      const extractedFields: IngestInput["extractedFields"] = {
        fullName: normalized.fullName,
        headline: normalized.headline,
        company: normalized.company,
        location: normalized.location,
        connectionDegree: row.connectionDegree ?? "1st",
      };

      const fieldPresence = {
        fullName: Boolean(extractedFields.fullName),
        headline: Boolean(extractedFields.headline),
        company: Boolean(extractedFields.company),
        location: Boolean(extractedFields.location),
        connectionDegree: Boolean(extractedFields.connectionDegree),
      };
      const filled = Object.values(fieldPresence).filter(Boolean).length;
      const confidence = filled / 4;

      const existing = tx.query.contacts.findFirst({
        where: eq(contacts.linkedinUrlCanonical, canonical),
      }).sync();

      const { merged, scores } = buildMergedAndScores(
        canonical,
        row.profileUrl,
        extractedFields,
        existing,
        now,
      );

      const outcome = syncPersistContact(tx, {
        now,
        schemaVersion: input.schemaVersion,
        pageType: "connections",
        captureSourceUrl: row.profileUrl,
        confidence,
        fieldPresence,
        extractedJson: extractedFields as Record<string, unknown>,
        existing,
        merged,
        scores,
      });
      if (outcome === "created") created += 1;
      else updated += 1;
    }
  });

  const canonicals = toProcess
    .map((row) => canonicalizeLinkedInUrl(row.profileUrl))
    .filter((c): c is string => Boolean(c && isProfileCanonicalUrl(c)));

  const touchedContactIds: string[] = [];
  for (const c of canonicals) {
    const row = await db.query.contacts.findFirst({
      where: eq(contacts.linkedinUrlCanonical, c),
    });
    if (row) touchedContactIds.push(row.id);
  }

  return {
    imported: created + updated,
    created,
    updated,
    receivedCount: input.rows.length,
    dedupedProfileCount: uniqueRows.length,
    skippedDueToHourlyCap: uniqueRows.length - toProcess.length,
    listSourceUrl: input.listSourceUrl,
    touchedContactIds,
  };
}

function maybeEnqueue(tx: DbClient, contactId: string, segment: string) {
  const open = tx.query.actionQueue.findFirst({
    where: and(
      eq(actionQueue.contactId, contactId),
      eq(actionQueue.status, "pending"),
    ),
  }).sync();
  if (open) return;

  if (segment === "dormant" || segment === "ghost" || segment === "remove_candidate") {
    tx.insert(actionQueue).values({
      id: crypto.randomUUID(),
      contactId,
      status: "pending",
      priority: segment === "remove_candidate" ? 2 : 1,
      suggestedAction:
        segment === "remove_candidate"
          ? "Review whether to keep this connection."
          : "Re-engage or archive — relationship has cooled.",
      kind: "review",
      createdAt: new Date(),
    }).run();
  }
}
