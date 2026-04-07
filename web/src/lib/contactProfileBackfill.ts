import { and, desc, eq } from "drizzle-orm";
import { captureSessions, contacts } from "@/db/schema";
import { normalizeExtractedPersonFields } from "@/lib/linkedinNormalize";
import { SCORE_RULE_VERSION, scoreContact } from "@/lib/scoring";
import { normalizeCompany } from "@/lib/url";
import type { getDb } from "@/db";

type Db = ReturnType<typeof getDb>;

function personFieldsFromStoredCaptureJson(json: unknown): {
  fullName?: string;
  headline?: string;
  company?: string;
  location?: string;
} {
  if (!json || typeof json !== "object") return {};
  const o = json as Record<string, unknown>;
  const src =
    o.extractedFields && typeof o.extractedFields === "object"
      ? (o.extractedFields as Record<string, unknown>)
      : o;
  const pick = (k: string): string | undefined => {
    const v = src[k];
    if (typeof v !== "string") return undefined;
    const t = v.trim();
    return t.length ? t : undefined;
  };
  return {
    fullName: pick("fullName"),
    headline: pick("headline"),
    company: pick("company"),
    location: pick("location"),
  };
}

function hasAnyPersonField(f: ReturnType<typeof personFieldsFromStoredCaptureJson>): boolean {
  return Boolean(f.fullName || f.headline || f.company || f.location);
}

/**
 * If the contact row is still empty but the latest profile capture JSON has fields,
 * copy them onto `contacts` and re-score. Fixes stubs where ingest wrote the session
 * but columns stayed null (or older bugs).
 */
export async function backfillContactFieldsFromLatestProfileCapture(
  db: Db,
  contactId: string,
): Promise<boolean> {
  const profileCap = await db.query.captureSessions.findFirst({
    where: and(
      eq(captureSessions.contactId, contactId),
      eq(captureSessions.pageType, "profile"),
    ),
    orderBy: [desc(captureSessions.capturedAt)],
  });
  if (!profileCap?.extractedJson) return false;

  const normalized = normalizeExtractedPersonFields(
    personFieldsFromStoredCaptureJson(profileCap.extractedJson),
  );
  if (!hasAnyPersonField(normalized)) return false;

  const c = await db.query.contacts.findFirst({
    where: eq(contacts.id, contactId),
  });
  if (!c) return false;

  const fullName = c.fullName?.trim() || normalized.fullName || null;
  const headline = c.headline?.trim() || normalized.headline || null;
  const company = c.company?.trim() || normalized.company || null;
  const location = c.location?.trim() || normalized.location || null;

  if (
    fullName === (c.fullName ?? null) &&
    headline === (c.headline ?? null) &&
    company === (c.company ?? null) &&
    location === (c.location ?? null)
  ) {
    return false;
  }

  const companyNormalized = normalizeCompany(company) ?? c.companyNormalized ?? null;
  const scores = scoreContact({
    ...c,
    fullName: fullName ?? undefined,
    headline: headline ?? undefined,
    company: company ?? undefined,
    companyNormalized: companyNormalized ?? undefined,
    location: location ?? undefined,
  });

  await db
    .update(contacts)
    .set({
      fullName,
      headline,
      company,
      location,
      companyNormalized,
      segment: scores.segment,
      relationshipScore: scores.relationshipScore,
      businessScore: scores.businessScore,
      cleanupScore: scores.cleanupScore,
      relationshipReasons: JSON.stringify(scores.relationshipReasons),
      businessReasons: JSON.stringify(scores.businessReasons),
      cleanupReasons: JSON.stringify(scores.cleanupReasons),
      scoreRuleVersion: SCORE_RULE_VERSION,
      lastUpdatedAt: new Date(),
    })
    .where(eq(contacts.id, contactId));

  return true;
}
