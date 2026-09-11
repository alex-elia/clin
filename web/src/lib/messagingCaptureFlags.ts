import { getSqlite } from "@/db";
import { chunkIds } from "@/lib/sqliteInChunks";

/** SQL predicate for rows that represent a LinkedIn messaging thread capture. */
export const MESSAGING_CAPTURE_SQL =
  "page_type = 'messaging' OR source_url LIKE '%/messaging/%'";

/**
 * Contacts Clin can treat as having messaging context: thread captures,
 * messaging URLs, or stored inbox thread analysis (including manual paste).
 */
export function loadMessagingCaptureFlags(contactIds: string[]): Set<string> {
  const set = new Set<string>();
  if (contactIds.length === 0) return set;
  try {
    for (const chunk of chunkIds(contactIds)) {
      const placeholders = chunk.map(() => "?").join(",");
      const captureRows = getSqlite()
        .prepare(
          `SELECT DISTINCT contact_id AS id
           FROM capture_sessions
           WHERE contact_id IN (${placeholders})
             AND (${MESSAGING_CAPTURE_SQL})`,
        )
        .all(...chunk) as { id: string }[];
      for (const r of captureRows) set.add(r.id);
    }
  } catch {
    /* table missing in ancient DB */
  }

  try {
    for (const chunk of chunkIds(contactIds)) {
      const placeholders = chunk.map(() => "?").join(",");
      const threadRows = getSqlite()
        .prepare(
          `SELECT DISTINCT contact_id AS id
           FROM inbox_thread_analysis
           WHERE contact_id IN (${placeholders})`,
        )
        .all(...chunk) as { id: string }[];
      for (const r of threadRows) set.add(r.id);
    }
  } catch {
    /* table missing */
  }

  return set;
}
