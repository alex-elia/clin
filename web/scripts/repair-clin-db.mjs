/**
 * Plain Node repair (no Next/webpack). Same fixes as web/src/db/repairSqlite.ts.
 * Run from `clin/web`: `npm run db:repair`
 */
import fs from "node:fs";
import Database from "better-sqlite3";
import { resolveClinDbPath } from "./lib/resolve-db-path.mjs";

function tableExists(db, name) {
  return Boolean(
    db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
      )
      .get(name),
  );
}

function addColumnOrExists(db, sql) {
  try {
    db.prepare(sql).run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/duplicate column name/i.test(msg)) return;
    if (/duplicate column/i.test(msg)) return;
    throw e;
  }
}

function repairClinSqliteSchema(db) {
  if (!tableExists(db, "contacts")) {
    console.error("No `contacts` table — open the app once so migrations run.");
    process.exit(1);
  }

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

  if (!tableExists(db, "content_posts")) {
    db.exec(`
      CREATE TABLE content_posts (
        id text PRIMARY KEY NOT NULL,
        title text NOT NULL,
        status text NOT NULL DEFAULT 'idea',
        format text NOT NULL DEFAULT 'feed',
        idea_notes text,
        hook text,
        body text,
        article_body text,
        linked_teaser_post_id text,
        style_notes text,
        media_json text,
        coach_flags text,
        last_coach_summary text,
        scheduled_at integer,
        ready_at integer,
        published_at integer,
        source_analytics_snapshot_id text,
        created_at integer NOT NULL,
        updated_at integer NOT NULL
      );
      CREATE INDEX content_posts_status_idx ON content_posts (status);
      CREATE INDEX content_posts_scheduled_idx ON content_posts (scheduled_at);
      CREATE INDEX content_posts_status_scheduled_idx ON content_posts (status, scheduled_at);
    `);
  }

  if (!tableExists(db, "content_brand_context")) {
    db.exec(`
      CREATE TABLE content_brand_context (
        id text PRIMARY KEY NOT NULL,
        content_doctrine text,
        expertise_summary text,
        publishing_rhythm text,
        stance_notes text,
        updated_at integer NOT NULL
      );
    `);
    db.prepare(
      "INSERT OR IGNORE INTO content_brand_context (id, updated_at) VALUES ('default', ?)",
    ).run(Date.now());
  }

  if (!tableExists(db, "content_ai_threads")) {
    db.exec(`
      CREATE TABLE content_ai_threads (
        id text PRIMARY KEY NOT NULL,
        scope text NOT NULL,
        post_id text,
        title text,
        created_at integer NOT NULL,
        updated_at integer NOT NULL,
        FOREIGN KEY (post_id) REFERENCES content_posts(id) ON DELETE SET NULL
      );
    `);
  }

  if (tableExists(db, "content_brand_context")) {
    addColumnOrExists(
      db,
      "ALTER TABLE content_brand_context ADD COLUMN content_language text DEFAULT 'auto'",
    );
  }

  if (tableExists(db, "content_posts")) {
    addColumnOrExists(db, "ALTER TABLE content_posts ADD COLUMN language text");
  }

  if (!tableExists(db, "content_ai_messages")) {
    db.exec(`
      CREATE TABLE content_ai_messages (
        id text PRIMARY KEY NOT NULL,
        thread_id text NOT NULL,
        role text NOT NULL,
        content text NOT NULL,
        actions_json text,
        created_at integer NOT NULL,
        FOREIGN KEY (thread_id) REFERENCES content_ai_threads(id) ON DELETE CASCADE
      );
      CREATE INDEX content_ai_messages_thread_idx ON content_ai_messages (thread_id);
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
}

const file = resolveClinDbPath();
fs.mkdirSync(file.replace(/[/\\][^/\\]+$/, ""), { recursive: true });
const db = new Database(file);
try {
  repairClinSqliteSchema(db);
  console.log(`[clin] Repaired SQLite: ${file}`);
} finally {
  db.close();
}
