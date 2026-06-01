import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const db = new Database(path.join(root, "data", "clin.db"));
const rows = db
  .prepare(
    "SELECT key, value FROM app_settings WHERE key LIKE 'llm.%' OR key LIKE 'ollama.%'",
  )
  .all();
console.log(JSON.stringify(rows, null, 2));
db.close();
