import { getSqlite } from "@/db";

export type ContactLlmExtension = {
  llmMessageContext: string | null;
  llmProvisionalJson: string | null;
  llmRefinedJson: string | null;
};

/** Optional SQLite columns — SELECT may fail if `npm run db:repair` was never run. */
export function listContactLlmExtensionsMap(
  contactIds: string[],
): Map<string, ContactLlmExtension> {
  const map = new Map<string, ContactLlmExtension>();
  if (contactIds.length === 0) return map;
  const placeholders = contactIds.map(() => "?").join(",");
  try {
    const rows = getSqlite()
      .prepare(
        `SELECT id, llm_message_context AS m, llm_provisional_json AS p, llm_refined_json AS r
         FROM contacts WHERE id IN (${placeholders})`,
      )
      .all(...contactIds) as {
      id: string;
      m: string | null;
      p: string | null;
      r: string | null;
    }[];
    for (const row of rows) {
      map.set(row.id, {
        llmMessageContext: row.m,
        llmProvisionalJson: row.p,
        llmRefinedJson: row.r,
      });
    }
  } catch {
    for (const id of contactIds) {
      map.set(id, {
        llmMessageContext: null,
        llmProvisionalJson: null,
        llmRefinedJson: null,
      });
    }
  }
  return map;
}

export function selectContactLlmExtension(
  contactId: string,
): ContactLlmExtension | null {
  try {
    const row = getSqlite()
      .prepare(
        `SELECT llm_message_context AS m, llm_provisional_json AS p, llm_refined_json AS r
         FROM contacts WHERE id = ?`,
      )
      .get(contactId) as
      | { m: string | null; p: string | null; r: string | null }
      | undefined;
    if (!row) return null;
    return {
      llmMessageContext: row.m,
      llmProvisionalJson: row.p,
      llmRefinedJson: row.r,
    };
  } catch {
    return {
      llmMessageContext: null,
      llmProvisionalJson: null,
      llmRefinedJson: null,
    };
  }
}

export function tryUpdateLlmMessageContext(
  contactId: string,
  text: string | null,
): void {
  try {
    const now = Date.now();
    if (text === null) {
      getSqlite()
        .prepare(
          "UPDATE contacts SET llm_message_context = NULL, last_updated_at = ? WHERE id = ?",
        )
        .run(now, contactId);
    } else {
      getSqlite()
        .prepare(
          "UPDATE contacts SET llm_message_context = ?, last_updated_at = ? WHERE id = ?",
        )
        .run(text, now, contactId);
    }
  } catch {
    /* optional columns */
  }
}

export function persistLlmAnalysis(
  contactId: string,
  tier: "provisional" | "refined",
  envelopeJson: string,
  model: string,
): void {
  const now = Date.now();
  try {
    if (tier === "provisional") {
      getSqlite()
        .prepare(
          `UPDATE contacts SET llm_provisional_json = ?, llm_provisional_at = ?,
            llm_last_model = ?, last_updated_at = ? WHERE id = ?`,
        )
        .run(envelopeJson, now, model, now, contactId);
    } else {
      getSqlite()
        .prepare(
          `UPDATE contacts SET llm_refined_json = ?, llm_refined_at = ?,
            llm_last_model = ?, last_updated_at = ? WHERE id = ?`,
        )
        .run(envelopeJson, now, model, now, contactId);
    }
  } catch {
    /* optional columns */
  }
}

export function tryUpdateHygieneVisitAt(contactId: string, atMs: number): void {
  try {
    const now = Date.now();
    getSqlite()
      .prepare(
        "UPDATE contacts SET last_hygiene_visit_at = ?, last_updated_at = ? WHERE id = ?",
      )
      .run(atMs, now, contactId);
  } catch {
    /* optional column */
  }
}
