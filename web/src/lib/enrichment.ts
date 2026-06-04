import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { contacts } from "@/db/schema";
import {
  loadLatestProfileCapturesByContactId,
  profileDepthFromLatestJson,
  type ProfileDepth,
} from "@/lib/campaignMemberReadiness";

const CANDIDATE_LIMIT = 120;

export function profileDepthForContact(
  contactId: string,
  caps: Awaited<ReturnType<typeof loadLatestProfileCapturesByContactId>>,
): ProfileDepth {
  const cap = caps.get(contactId);
  if (!cap) return "missing";
  let depth = profileDepthFromLatestJson(cap.extractedJson);
  if (depth === "missing") depth = "thin";
  return depth;
}

/** Contacts that only have list/card data — need a full profile capture. */
export async function countContactsNeedingProfileCapture(): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ id: contacts.id })
    .from(contacts)
    .orderBy(desc(contacts.lastUpdatedAt))
    .limit(CANDIDATE_LIMIT);
  if (rows.length === 0) return 0;
  const caps = await loadLatestProfileCapturesByContactId(rows.map((r) => r.id));
  let n = 0;
  for (const r of rows) {
    if (profileDepthForContact(r.id, caps) !== "ok") n += 1;
  }
  return n;
}

/**
 * Next contact to open for automated profile capture (missing → thin).
 */
export async function pickNextEnrichContact(): Promise<
  typeof contacts.$inferSelect | null
> {
  const db = getDb();
  const candidates = await db
    .select()
    .from(contacts)
    .orderBy(desc(contacts.lastUpdatedAt))
    .limit(CANDIDATE_LIMIT);

  if (candidates.length === 0) return null;

  const caps = await loadLatestProfileCapturesByContactId(
    candidates.map((c) => c.id),
  );

  const missing: (typeof contacts.$inferSelect)[] = [];
  const thin: (typeof contacts.$inferSelect)[] = [];

  for (const c of candidates) {
    const url = c.linkedinUrlCanonical?.trim();
    if (!url || !url.includes("/in/")) continue;
    const depth = profileDepthForContact(c.id, caps);
    if (depth === "ok") continue;
    if (depth === "missing") missing.push(c);
    else thin.push(c);
  }

  return missing[0] ?? thin[0] ?? null;
}
