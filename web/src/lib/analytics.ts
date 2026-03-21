import { desc, sql } from "drizzle-orm";
import { getDb, getSqlite } from "@/db";
import { contacts } from "@/db/schema";

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Last `days` calendar days in local timezone, with capture counts per day. */
export function getCapturesPerDaySeries(days: number): {
  day: string;
  count: number;
}[] {
  const sqlite = getSqlite();
  const stmt = sqlite.prepare(
    `SELECT COUNT(*) AS n FROM capture_sessions WHERE captured_at >= ? AND captured_at < ?`,
  );
  const out: { day: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const start = d.getTime();
    const end = start + 86_400_000;
    const row = stmt.get(start, end) as { n: number };
    out.push({ day: formatLocalYmd(d), count: Number(row.n) });
  }
  return out;
}

export type ScoreBucket = { bucket: string; count: number };

export function getRelationshipScoreBuckets(): ScoreBucket[] {
  const sqlite = getSqlite();
  const rows = sqlite
    .prepare(
      `SELECT 
        CASE 
          WHEN relationship_score >= 70 THEN '70+ (strong)'
          WHEN relationship_score >= 50 THEN '50–69'
          WHEN relationship_score >= 35 THEN '35–49'
          ELSE '<35 (cold)'
        END AS bucket,
        COUNT(*) AS n
      FROM contacts
      GROUP BY bucket`,
    )
    .all() as { bucket: string; n: number }[];

  const order = ["70+ (strong)", "50–69", "35–49", "<35 (cold)"];
  const map = new Map(rows.map((r) => [r.bucket, Number(r.n)]));
  return order.map((bucket) => ({ bucket, count: map.get(bucket) ?? 0 }));
}

export async function getTopOpportunities(limit = 8) {
  const db = getDb();
  return db
    .select({
      id: contacts.id,
      fullName: contacts.fullName,
      company: contacts.company,
      headline: contacts.headline,
      businessScore: contacts.businessScore,
      segment: contacts.segment,
      linkedinUrlCanonical: contacts.linkedinUrlCanonical,
    })
    .from(contacts)
    .orderBy(desc(contacts.businessScore))
    .limit(limit);
}

export async function getAvgScores() {
  const db = getDb();
  const [row] = await db
    .select({
      avgRel: sql<number>`round(avg(${contacts.relationshipScore}), 1)`,
      avgBiz: sql<number>`round(avg(${contacts.businessScore}), 1)`,
      avgClean: sql<number>`round(avg(${contacts.cleanupScore}), 1)`,
    })
    .from(contacts);
  return {
    avgRelationship: row?.avgRel ?? 0,
    avgBusiness: row?.avgBiz ?? 0,
    avgCleanup: row?.avgClean ?? 0,
  };
}
