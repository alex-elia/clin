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
import { canonicalizeLinkedInUrl, normalizeCompany } from "@/lib/url";
import { SCORE_RULE_VERSION, scoreContact } from "@/lib/scoring";

type Db = ReturnType<typeof getDb>;
type DbClient = BetterSQLite3Database<typeof schema>;

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
  };
  fieldPresence?: Record<string, boolean>;
};

export async function ingestCapture(db: Db, input: IngestInput) {
  if (!ALLOWED_SCHEMA.has(input.schemaVersion)) {
    throw new Error(`Unsupported schemaVersion: ${input.schemaVersion}`);
  }

  const canonical = canonicalizeLinkedInUrl(input.sourceUrl);
  if (!canonical) {
    throw new Error("Could not derive canonical LinkedIn URL from sourceUrl");
  }

  const now = input.capturedAt ? new Date(input.capturedAt) : new Date();
  const id = crypto.randomUUID();
  const captureId = crypto.randomUUID();
  const snapshotId = crypto.randomUUID();

  const companyNorm = normalizeCompany(input.extractedFields.company);

  const existing = await db.query.contacts.findFirst({
    where: eq(contacts.linkedinUrlCanonical, canonical),
  });

  const merged: Partial<typeof contacts.$inferInsert> = {
    linkedinUrlCanonical: canonical,
    linkedinUrlRaw: input.sourceUrl,
    fullName: input.extractedFields.fullName ?? existing?.fullName ?? null,
    headline: input.extractedFields.headline ?? existing?.headline ?? null,
    company: input.extractedFields.company ?? existing?.company ?? null,
    companyNormalized: companyNorm ?? existing?.companyNormalized ?? null,
    location: input.extractedFields.location ?? existing?.location ?? null,
    connectionDegree:
      input.extractedFields.connectionDegree ?? existing?.connectionDegree ?? null,
    lastSeenAt: now,
    lastUpdatedAt: now,
  };

  type ContactRow = typeof contacts.$inferSelect;
  const baseForScore: Partial<ContactRow> = {
    ...(existing ?? {}),
    ...merged,
    lastSeenAt: now,
  };

  const scores = scoreContact(baseForScore);

  await db.transaction(async (tx) => {
    if (existing) {
      await tx
        .update(contacts)
        .set({
          ...merged,
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
        })
        .where(eq(contacts.id, existing.id));

      await tx.insert(captureSessions).values({
        id: captureId,
        contactId: existing.id,
        schemaVersion: input.schemaVersion,
        pageType: input.pageType,
        sourceUrl: input.sourceUrl,
        confidence: input.confidence ?? null,
        fieldPresence: input.fieldPresence ?? null,
        extractedJson: input.extractedFields as Record<string, unknown>,
        capturedAt: now,
      });

      await tx.insert(contactSnapshots).values({
        id: snapshotId,
        contactId: existing.id,
        capturedAt: now,
        snapshotJson: {
          ...input.extractedFields,
          segment: scores.segment,
          scores: {
            relationship: scores.relationshipScore,
            business: scores.businessScore,
            cleanup: scores.cleanupScore,
          },
        },
      });

      await maybeEnqueue(tx, existing.id, scores.segment);
    } else {
      await tx.insert(contacts).values({
        id,
        linkedinUrlCanonical: canonical,
        linkedinUrlRaw: input.sourceUrl,
        fullName: merged.fullName ?? null,
        headline: merged.headline ?? null,
        company: merged.company ?? null,
        companyNormalized: merged.companyNormalized ?? null,
        location: merged.location ?? null,
        connectionDegree: merged.connectionDegree ?? null,
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
      });

      await tx.insert(captureSessions).values({
        id: captureId,
        contactId: id,
        schemaVersion: input.schemaVersion,
        pageType: input.pageType,
        sourceUrl: input.sourceUrl,
        confidence: input.confidence ?? null,
        fieldPresence: input.fieldPresence ?? null,
        extractedJson: input.extractedFields as Record<string, unknown>,
        capturedAt: now,
      });

      await tx.insert(contactSnapshots).values({
        id: snapshotId,
        contactId: id,
        capturedAt: now,
        snapshotJson: {
          ...input.extractedFields,
          segment: scores.segment,
          scores: {
            relationship: scores.relationshipScore,
            business: scores.businessScore,
            cleanup: scores.cleanupScore,
          },
        },
      });

      await maybeEnqueue(tx, id, scores.segment);
    }
  });

  const row = await db.query.contacts.findFirst({
    where: eq(contacts.linkedinUrlCanonical, canonical),
  });

  return { contactId: row!.id, canonicalUrl: canonical, scores };
}

async function maybeEnqueue(tx: DbClient, contactId: string, segment: string) {
  const open = await tx.query.actionQueue.findFirst({
    where: and(
      eq(actionQueue.contactId, contactId),
      eq(actionQueue.status, "pending"),
    ),
  });
  if (open) return;

  if (segment === "dormant" || segment === "ghost" || segment === "remove_candidate") {
    await tx.insert(actionQueue).values({
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
    });
  }
}
