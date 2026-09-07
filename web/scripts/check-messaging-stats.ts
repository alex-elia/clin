import { getSqlite } from "../src/db";

const db = getSqlite();
const types = db
  .prepare(
    `SELECT page_type AS pageType, COUNT(*) AS n FROM capture_sessions GROUP BY page_type ORDER BY n DESC`,
  )
  .all() as { pageType: string; n: number }[];
console.log("page types:", types);

const msg = db
  .prepare(
    `SELECT COUNT(DISTINCT contact_id) AS n FROM capture_sessions WHERE page_type = 'messaging'`,
  )
  .get() as { n: number };
console.log("messaging contacts (page_type=messaging):", msg.n);

const withMsgJson = db
  .prepare(
    `SELECT COUNT(DISTINCT contact_id) AS n FROM capture_sessions
     WHERE extracted_json LIKE '%messagingMessages%' OR extracted_json LIKE '%messagingThreadId%'`,
  )
  .get() as { n: number };
console.log("contacts with messaging in extracted_json:", withMsgJson.n);

const profileWithMsg = db
  .prepare(
    `SELECT COUNT(DISTINCT contact_id) AS n FROM capture_sessions
     WHERE page_type = 'profile'
       AND (extracted_json LIKE '%messagingMessages%' OR extracted_json LIKE '%messageSnippet%')`,
  )
  .get() as { n: number };
console.log("profile captures with message fields:", profileWithMsg.n);

const withMsgUrl = db
  .prepare(
    `SELECT COUNT(DISTINCT contact_id) AS n FROM capture_sessions
     WHERE source_url LIKE '%/messaging/%'`,
  )
  .get() as { n: number };
console.log("contacts with messaging in source_url:", withMsgUrl.n);

try {
  const threadAnalysis = db
    .prepare(`SELECT COUNT(*) AS n FROM inbox_thread_analysis`)
    .get() as { n: number };
  console.log("inbox_thread_analysis rows:", threadAnalysis.n);
} catch {
  console.log("inbox_thread_analysis: table missing");
}
