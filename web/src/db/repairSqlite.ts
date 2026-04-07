import type Database from "better-sqlite3";

function tableExists(db: Database.Database, name: string): boolean {
  const row = db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    )
    .get(name);
  return Boolean(row);
}

/** SQLite has no IF NOT EXISTS for columns; ignore duplicate-column errors only. */
function addColumnOrExists(db: Database.Database, sql: string): void {
  try {
    db.prepare(sql).run();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/duplicate column name/i.test(msg)) return;
    if (/duplicate column/i.test(msg)) return;
    throw e;
  }
}

/**
 * Idempotent schema fixes. Uses ALTER attempts instead of relying only on PRAGMA
 * (some setups reported missing columns even after PRAGMA-based repair).
 */
export function repairClinSqliteSchema(db: Database.Database): void {
  if (!tableExists(db, "contacts")) return;

  addColumnOrExists(
    db,
    "ALTER TABLE contacts ADD COLUMN last_hygiene_visit_at integer",
  );
  addColumnOrExists(db, "ALTER TABLE contacts ADD COLUMN llm_message_context text");
  addColumnOrExists(
    db,
    "ALTER TABLE contacts ADD COLUMN llm_provisional_json text",
  );
  addColumnOrExists(
    db,
    "ALTER TABLE contacts ADD COLUMN llm_provisional_at integer",
  );
  addColumnOrExists(db, "ALTER TABLE contacts ADD COLUMN llm_refined_json text");
  addColumnOrExists(
    db,
    "ALTER TABLE contacts ADD COLUMN llm_refined_at integer",
  );
  addColumnOrExists(db, "ALTER TABLE contacts ADD COLUMN llm_last_model text");

  if (tableExists(db, "user_context")) {
    addColumnOrExists(
      db,
      "ALTER TABLE user_context ADD COLUMN pending_self_capture_url text",
    );
    addColumnOrExists(
      db,
      "ALTER TABLE user_context ADD COLUMN pending_self_capture_at integer",
    );
  }

  if (!tableExists(db, "automation_log")) {
    db.exec(`
      CREATE TABLE automation_log (
        id text PRIMARY KEY NOT NULL,
        contact_id text NOT NULL,
        kind text NOT NULL,
        outcome text,
        created_at integer NOT NULL
      );
    `);
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS automation_log_created_idx ON automation_log (created_at);
    CREATE INDEX IF NOT EXISTS automation_log_contact_idx ON automation_log (contact_id);
  `);

  if (tableExists(db, "outreach_campaigns")) {
    addColumnOrExists(
      db,
      "ALTER TABLE outreach_campaigns ADD COLUMN writer_instructions text",
    );
    addColumnOrExists(
      db,
      "ALTER TABLE outreach_campaigns ADD COLUMN system_prompt_override text",
    );
  }

}
