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
  addColumnOrExists(
    db,
    "ALTER TABLE contacts ADD COLUMN cleaning_user_bucket text",
  );
  addColumnOrExists(
    db,
    "ALTER TABLE contacts ADD COLUMN cleaning_dismissed_at integer",
  );

  if (!tableExists(db, "cleaning_exec_queue")) {
    db.exec(`
      CREATE TABLE cleaning_exec_queue (
        id text PRIMARY KEY NOT NULL,
        contact_id text NOT NULL,
        kind text NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        payload_json text,
        outcome text,
        error text,
        created_at integer NOT NULL,
        completed_at integer,
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
      );
      CREATE INDEX cleaning_exec_kind_status_idx ON cleaning_exec_queue (kind, status);
      CREATE INDEX cleaning_exec_contact_idx ON cleaning_exec_queue (contact_id);
    `);
  }

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
    addColumnOrExists(
      db,
      "ALTER TABLE outreach_campaigns ADD COLUMN icp_text text",
    );
  }

  if (tableExists(db, "outreach_campaign_members")) {
    addColumnOrExists(
      db,
      "ALTER TABLE outreach_campaign_members ADD COLUMN message_sent_at integer",
    );
    addColumnOrExists(
      db,
      "ALTER TABLE outreach_campaign_members ADD COLUMN message_reply_outcome text NOT NULL DEFAULT 'unknown'",
    );
    addColumnOrExists(
      db,
      "ALTER TABLE outreach_campaign_members ADD COLUMN message_outcome_note text",
    );
    addColumnOrExists(
      db,
      "ALTER TABLE outreach_campaign_members ADD COLUMN closed_at integer",
    );
    addColumnOrExists(
      db,
      "ALTER TABLE outreach_campaign_members ADD COLUMN close_reason text",
    );
    addColumnOrExists(
      db,
      "ALTER TABLE outreach_campaign_members ADD COLUMN icp_match text",
    );
    addColumnOrExists(
      db,
      "ALTER TABLE outreach_campaign_members ADD COLUMN icp_rationale text",
    );
    addColumnOrExists(
      db,
      "ALTER TABLE outreach_campaign_members ADD COLUMN icp_recommended_action text",
    );
    addColumnOrExists(
      db,
      "ALTER TABLE outreach_campaign_members ADD COLUMN icp_checked_at integer",
    );
  }

  if (!tableExists(db, "inbox_thread_state")) {
    db.exec(`
      CREATE TABLE inbox_thread_state (
        id text PRIMARY KEY NOT NULL,
        contact_id text NOT NULL,
        thread_key text NOT NULL,
        status text NOT NULL DEFAULT 'open',
        snoozed_until integer,
        note text,
        updated_at integer NOT NULL,
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX inbox_thread_contact_key ON inbox_thread_state (contact_id, thread_key);
      CREATE INDEX inbox_thread_status_idx ON inbox_thread_state (status);
    `);
  }

  if (!tableExists(db, "extension_snapshots")) {
    db.exec(`
      CREATE TABLE extension_snapshots (
        id text PRIMARY KEY NOT NULL,
        kind text NOT NULL,
        source_url text NOT NULL,
        payload_json text NOT NULL,
        captured_at integer NOT NULL
      );
      CREATE INDEX ext_snap_kind_idx ON extension_snapshots (kind);
      CREATE INDEX ext_snap_captured_idx ON extension_snapshots (captured_at);
    `);
  }

  if (!tableExists(db, "outreach_send_log")) {
    db.exec(`
      CREATE TABLE outreach_send_log (
        id text PRIMARY KEY NOT NULL,
        campaign_member_id text,
        contact_id text NOT NULL,
        action text NOT NULL,
        outcome text NOT NULL,
        error text,
        created_at integer NOT NULL
      );
      CREATE INDEX outreach_send_log_created_idx ON outreach_send_log (created_at);
      CREATE INDEX outreach_send_log_contact_idx ON outreach_send_log (contact_id);
    `);
  }

  if (!tableExists(db, "inbox_thread_analysis")) {
    db.exec(`
      CREATE TABLE inbox_thread_analysis (
        id text PRIMARY KEY NOT NULL,
        contact_id text NOT NULL,
        thread_key text NOT NULL,
        analysis_json text NOT NULL,
        message_count integer NOT NULL,
        model text,
        analyzed_at integer NOT NULL,
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX inbox_thread_analysis_contact_key ON inbox_thread_analysis (contact_id, thread_key);
      CREATE INDEX inbox_thread_analysis_analyzed_idx ON inbox_thread_analysis (analyzed_at);
    `);
  }
}
