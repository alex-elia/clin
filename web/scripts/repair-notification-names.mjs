/**
 * Fix contacts whose full_name is LinkedIn notification UI (FR/EN).
 * Run from clin/web: node scripts/repair-notification-names.mjs
 */
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { resolveClinDbPath } from "./lib/resolve-db-path.mjs";

function sanitize(raw) {
  if (!raw?.trim()) return null;
  const t = raw.replace(/\s+/g, " ").trim();
  if (
    /gérer les notifications|manage notifications|turn on notifications/i.test(t)
  ) {
    const fr = t.match(/au sujet de (.+)$/i);
    if (fr?.[1]) return fr[1].trim();
    const en = t.match(/about (.+)$/i);
    if (en?.[1]) return en[1].trim();
    return null;
  }
  return t;
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const db = new Database(resolveClinDbPath(root));
const rows = db
  .prepare(
    `SELECT id, full_name FROM contacts WHERE full_name IS NOT NULL`,
  )
  .all();

let fixed = 0;
const upd = db.prepare(`UPDATE contacts SET full_name = ? WHERE id = ?`);
for (const r of rows) {
  const next = sanitize(r.full_name);
  if (!next || next === r.full_name) continue;
  upd.run(next, r.id);
  console.log(`[clin] ${r.id}: "${r.full_name}" → "${next}"`);
  fixed += 1;
}
db.close();
console.log(`[clin] Repaired ${fixed} contact name(s).`);
