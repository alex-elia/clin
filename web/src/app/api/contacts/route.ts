import { and, desc, eq, like, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { contacts } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const segment = searchParams.get("segment")?.trim();
  const limit = Math.min(Number(searchParams.get("limit") ?? 50) || 50, 100);
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0) || 0);

  const db = getDb();

  const filters = [];
  if (segment) filters.push(eq(contacts.segment, segment));
  if (q) {
    const pattern = `%${q.replace(/%/g, "\\%")}%`;
    filters.push(
      or(
        like(contacts.fullName, pattern),
        like(contacts.company, pattern),
        like(contacts.headline, pattern),
      )!,
    );
  }

  const where =
    filters.length === 0
      ? undefined
      : filters.length === 1
        ? filters[0]
        : and(...filters);

  const rows = await db.query.contacts.findMany({
    where,
    orderBy: [desc(contacts.lastUpdatedAt), desc(contacts.id)],
    limit,
    offset,
  });

  return NextResponse.json({ items: rows, limit, offset });
}
