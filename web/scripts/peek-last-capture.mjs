import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = path.join(root, "data", "clin.db");
const db = new Database(dbPath, { readonly: true });

const rows = db
  .prepare(
    `SELECT cs.id, cs.page_type, cs.captured_at, cs.field_presence, cs.extracted_json,
            c.id AS contact_id, c.full_name, c.headline, c.company, c.location,
            c.linkedin_url_canonical
     FROM capture_sessions cs
     LEFT JOIN contacts c ON c.id = cs.contact_id
     ORDER BY cs.captured_at DESC
     LIMIT 5`,
  )
  .all();

for (const r of rows) {
  console.log("---");
  console.log("captured_at:", r.captured_at);
  console.log("page_type:", r.page_type);
  console.log("url:", r.linkedin_url_canonical);
  console.log("contact row:", {
    full_name: r.full_name,
    headline: r.headline,
    company: r.company,
    location: r.location,
  });
  console.log("field_presence:", r.field_presence);
  let extracted = r.extracted_json;
  try {
    extracted = JSON.parse(extracted);
  } catch {
    /* keep raw */
  }
  console.log("extracted_json:", JSON.stringify(extracted, null, 2));
}

db.close();
