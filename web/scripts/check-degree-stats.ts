import Database from "better-sqlite3";
import { resolveClinDbPath } from "../src/lib/dbPathResolve";

const db = new Database(resolveClinDbPath());
const total = db.prepare("SELECT COUNT(*) AS n FROM contacts").get() as {
  n: number;
};
const withDegree = db
  .prepare(
    "SELECT COUNT(*) AS n FROM contacts WHERE connection_degree IN ('1st','2nd','3rd+')",
  )
  .get() as { n: number };
const nullDegree = db
  .prepare(
    "SELECT COUNT(*) AS n FROM contacts WHERE connection_degree IS NULL OR trim(connection_degree) = ''",
  )
  .get() as { n: number };
const sample = db
  .prepare(
    "SELECT connection_degree AS d, COUNT(*) AS n FROM contacts GROUP BY connection_degree ORDER BY n DESC LIMIT 15",
  )
  .all();
const capturedNoDegree = db
  .prepare(
    `SELECT COUNT(*) AS n FROM contacts c
     WHERE EXISTS (SELECT 1 FROM capture_sessions s WHERE s.contact_id = c.id)
     AND (c.connection_degree IS NULL OR trim(c.connection_degree) = '')`,
  )
  .get() as { n: number };

console.log("db:", resolveClinDbPath());
console.log({ total: total.n, withDegree: withDegree.n, nullDegree: nullDegree.n, capturedNoDegree: capturedNoDegree.n });
console.log("by degree:", sample);
