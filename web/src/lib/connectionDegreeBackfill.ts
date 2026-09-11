import { eq, isNull, or, sql } from "drizzle-orm";
import type { getDb } from "@/db";
import { getSqlite } from "@/db";
import { contacts } from "@/db/schema";
import {
  normalizeConnectionDegree,
  resolveDegreeFromCaptures,
  isDisconnectedDegree,
  type ConnectionDegreeBackfillResult,
} from "@/lib/connectionDegree";
import { invalidateNetworkHygieneSnapshot } from "@/lib/networkHygienePipeline";
import { listContactCleaningExtensionsMap } from "@/lib/cleaningSqlExtras";

type Db = ReturnType<typeof getDb>;

export async function backfillConnectionDegrees(
  db: Db,
): Promise<ConnectionDegreeBackfillResult> {
  const allContacts = await db
    .select({
      id: contacts.id,
      connectionDegree: contacts.connectionDegree,
    })
    .from(contacts);

  const cleaningMap = listContactCleaningExtensionsMap(
    allContacts.map((c) => c.id),
  );

  const captureRows = getSqlite()
    .prepare(
      `SELECT contact_id AS contactId, page_type AS pageType, extracted_json AS extractedJson
       FROM capture_sessions
       WHERE contact_id IS NOT NULL
       ORDER BY
         CASE WHEN page_type = 'connections' THEN 0 ELSE 1 END,
         captured_at DESC`,
    )
    .all() as {
    contactId: string;
    pageType: string;
    extractedJson: string | null;
  }[];

  const capturesByContact = new Map<
    string,
    { pageType: string; extractedJson: string | null }[]
  >();
  for (const row of captureRows) {
    const list = capturesByContact.get(row.contactId) ?? [];
    list.push({
      pageType: row.pageType,
      extractedJson: row.extractedJson,
    });
    capturesByContact.set(row.contactId, list);
  }

  let updated = 0;
  let alreadyOk = 0;
  let noSignal = 0;
  const now = new Date();

  for (const contact of allContacts) {
    if (isDisconnectedDegree(contact.connectionDegree)) {
      alreadyOk += 1;
      continue;
    }
    const cleaningExt = cleaningMap.get(contact.id);
    if (cleaningExt?.cleaningDismissedAt) {
      alreadyOk += 1;
      continue;
    }

    const current = normalizeConnectionDegree(contact.connectionDegree);
    const caps = capturesByContact.get(contact.id) ?? [];
    const resolved = resolveDegreeFromCaptures(caps);

    if (!resolved) {
      if (current) alreadyOk += 1;
      else noSignal += 1;
      continue;
    }

    if (current === resolved && contact.connectionDegree === resolved) {
      alreadyOk += 1;
      continue;
    }

    await db
      .update(contacts)
      .set({
        connectionDegree: resolved,
        lastUpdatedAt: now,
      })
      .where(eq(contacts.id, contact.id));
    updated += 1;
  }

  if (updated > 0) {
    invalidateNetworkHygieneSnapshot();
  }

  return {
    scanned: allContacts.length,
    updated,
    alreadyOk,
    noSignal,
  };
}

/** Contacts missing a normalized degree (for metrics / diagnostics). */
export async function countContactsMissingNormalizedDegree(
  db: Db,
): Promise<number> {
  const rows = await db
    .select({ id: contacts.id, connectionDegree: contacts.connectionDegree })
    .from(contacts)
    .where(
      or(
        isNull(contacts.connectionDegree),
        sql`trim(${contacts.connectionDegree}) = ''`,
      ),
    );
  let missing = 0;
  for (const row of rows) {
    if (!normalizeConnectionDegree(row.connectionDegree)) missing += 1;
  }
  return missing;
}
