/**
 * Plain Node repair (no Next/webpack). Adds optional hygiene + LLM columns and
 * `automation_log` if missing. Run from `clin/web`: `npm run db:repair`
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

function migrationsFolder() {
  const a = path.join(process.cwd(), "drizzle");
  const b = path.join(process.cwd(), "web", "drizzle");
  const c = path.join(webRoot, "drizzle");
  if (fs.existsSync(path.join(a, "meta", "_journal.json"))) return a;
  if (fs.existsSync(path.join(b, "meta", "_journal.json"))) return b;
  if (fs.existsSync(path.join(c, "meta", "_journal.json"))) return c;
  throw new Error(
    `[clin] Drizzle migrations not found (cwd=${process.cwd()}). cd into clin/web and retry.`,
  );
}

function dbFilePath() {
  const env = process.env.CLIN_DB_PATH?.trim();
  if (env) {
    return path.isAbsolute(env) ? env : path.join(process.cwd(), env);
  }
  const mig = migrationsFolder();
  return path.join(path.dirname(mig), "data", "clin.db");
}

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

function repair(db) {
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
}

const file = dbFilePath();
fs.mkdirSync(path.dirname(file), { recursive: true });
const db = new Database(file);
try {
  repair(db);
  console.log(`[clin] Repaired SQLite: ${file}`);
} finally {
  db.close();
}
