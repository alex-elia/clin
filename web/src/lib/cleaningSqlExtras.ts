import { getSqlite } from "@/db";
import type { CleaningBucket } from "@/lib/cleaningBuckets";
import { isCleaningBucket } from "@/lib/cleaningBuckets";

export type ContactCleaningExtension = {
  cleaningUserBucket: CleaningBucket | null;
  cleaningDismissedAt: number | null;
};

export function listContactCleaningExtensionsMap(
  contactIds: string[],
): Map<string, ContactCleaningExtension> {
  const map = new Map<string, ContactCleaningExtension>();
  if (contactIds.length === 0) return map;
  const placeholders = contactIds.map(() => "?").join(",");
  try {
    const rows = getSqlite()
      .prepare(
        `SELECT id, cleaning_user_bucket AS b, cleaning_dismissed_at AS d
         FROM contacts WHERE id IN (${placeholders})`,
      )
      .all(...contactIds) as {
      id: string;
      b: string | null;
      d: number | null;
    }[];
    for (const row of rows) {
      map.set(row.id, {
        cleaningUserBucket:
          row.b && isCleaningBucket(row.b) ? row.b : null,
        cleaningDismissedAt: row.d ?? null,
      });
    }
  } catch {
    for (const id of contactIds) {
      map.set(id, {
        cleaningUserBucket: null,
        cleaningDismissedAt: null,
      });
    }
  }
  return map;
}

export function tryUpdateCleaningUserBucket(
  contactId: string,
  bucket: CleaningBucket | null,
): void {
  try {
    const now = Date.now();
    if (bucket === null) {
      getSqlite()
        .prepare(
          "UPDATE contacts SET cleaning_user_bucket = NULL, last_updated_at = ? WHERE id = ?",
        )
        .run(now, contactId);
    } else {
      getSqlite()
        .prepare(
          "UPDATE contacts SET cleaning_user_bucket = ?, last_updated_at = ? WHERE id = ?",
        )
        .run(bucket, now, contactId);
    }
  } catch {
    /* optional columns */
  }
}

export function tryUpdateCleaningDismissedAt(
  contactId: string,
  dismissed: boolean,
): void {
  try {
    const now = Date.now();
    getSqlite()
      .prepare(
        `UPDATE contacts SET cleaning_dismissed_at = ?, last_updated_at = ? WHERE id = ?`,
      )
      .run(dismissed ? now : null, now, contactId);
  } catch {
    /* optional columns */
  }
}
