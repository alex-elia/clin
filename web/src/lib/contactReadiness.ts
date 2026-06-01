import { desc } from "drizzle-orm";
import { getDb, getSqlite } from "@/db";
import { contacts } from "@/db/schema";
import { loadLatestProfileCapturesByContactId } from "@/lib/campaignMemberReadiness";
import { profileDepthForContact } from "@/lib/enrichment";
import type {
  ContactReadiness,
  ExtractionReadiness,
  ProfileDepth,
} from "@/lib/contactReadinessShared";

export type {
  ContactReadiness,
  ExtractionReadiness,
  ProfileDepth,
} from "@/lib/contactReadinessShared";
export { EXTRACTION_READINESS_LABELS } from "@/lib/contactReadinessShared";

function extractionLevel(input: {
  profileDepth: ProfileDepth;
  hasMessaging: boolean;
}): ExtractionReadiness {
  if (input.profileDepth === "ok" && input.hasMessaging) {
    return "profile_and_messages";
  }
  if (input.profileDepth === "ok") return "profile_ok";
  if (input.profileDepth === "thin") return "thin_profile";
  return "list_only";
}

export function assessContactReadiness(
  row: typeof contacts.$inferSelect,
  caps: Awaited<ReturnType<typeof loadLatestProfileCapturesByContactId>>,
  hasMessagingCapture: boolean,
): ContactReadiness {
  const profileDepth = profileDepthForContact(row.id, caps);
  const hasProfileCapture = profileDepth !== "missing";
  const hasHeadline = Boolean(row.headline?.trim());
  const hasCompany = Boolean(
    row.company?.trim() || row.companyNormalized?.trim(),
  );
  const hasName = Boolean(row.fullName?.trim());
  const level = extractionLevel({
    profileDepth,
    hasMessaging: hasMessagingCapture,
  });

  const missing: string[] = [];
  if (!hasProfileCapture) missing.push("Full profile capture");
  else if (profileDepth === "thin") {
    missing.push("Richer profile (About or Experience)");
  }
  if (!hasHeadline) missing.push("Headline");
  if (!hasCompany) missing.push("Company");
  if (!hasName) missing.push("Name");

  const readyForAnalysis =
    hasProfileCapture &&
    (hasHeadline || hasName) &&
    (profileDepth === "ok" || profileDepth === "thin");

  const readyForDecisions =
    profileDepth === "ok" || (profileDepth === "thin" && hasHeadline);

  return {
    contactId: row.id,
    profileDepth,
    hasProfileCapture,
    hasMessagingCapture,
    hasHeadline,
    hasCompany,
    extractionLevel: level,
    readyForAnalysis,
    readyForDecisions,
    missing,
  };
}

export function loadMessagingCaptureFlags(contactIds: string[]): Set<string> {
  const set = new Set<string>();
  if (contactIds.length === 0) return set;
  const placeholders = contactIds.map(() => "?").join(",");
  try {
    const rows = getSqlite()
      .prepare(
        `SELECT DISTINCT contact_id AS id
         FROM capture_sessions
         WHERE page_type = 'messaging'
           AND contact_id IN (${placeholders})`,
      )
      .all(...contactIds) as { id: string }[];
    for (const r of rows) set.add(r.id);
  } catch {
    /* table missing in ancient DB */
  }
  return set;
}

/** Batch readiness for cleaning board (recent contacts). */
export async function assessRecentContactsReadiness(
  limit = 400,
): Promise<Map<string, ContactReadiness>> {
  const db = getDb();
  const rows = await db
    .select()
    .from(contacts)
    .orderBy(desc(contacts.lastUpdatedAt))
    .limit(limit);
  if (rows.length === 0) return new Map();

  const ids = rows.map((r) => r.id);
  const caps = await loadLatestProfileCapturesByContactId(ids);
  const messaging = loadMessagingCaptureFlags(ids);

  const map = new Map<string, ContactReadiness>();
  for (const row of rows) {
    map.set(
      row.id,
      assessContactReadiness(row, caps, messaging.has(row.id)),
    );
  }
  return map;
}
