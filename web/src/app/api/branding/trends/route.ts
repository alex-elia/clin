import { NextResponse } from "next/server";
import { listTrendInbox } from "@/lib/sources/contentSources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") ?? "7");
  const limit = Number(url.searchParams.get("limit") ?? "15");
  const items = await listTrendInbox({
    days: Number.isFinite(days) ? days : 7,
    limit: Number.isFinite(limit) ? limit : 15,
  });
  return NextResponse.json({
    items: items.map((it) => ({
      id: it.id,
      title: it.title,
      url: it.url,
      excerpt: it.excerpt,
      itemKind: it.itemKind,
      trendScore: it.trendScore != null ? it.trendScore / 100 : null,
      fetchedAt: it.fetchedAt,
      sourceId: it.sourceId,
    })),
  });
}
