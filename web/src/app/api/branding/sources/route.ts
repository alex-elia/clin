import { NextResponse } from "next/server";
import { z } from "zod";
import {
  listContentSources,
  listSourceItemsBySource,
  upsertContentSource,
} from "@/lib/sources/contentSources";
import { enqueueEditorialJob } from "@/lib/editorial/editorialJobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sources = await listContentSources();
  const withItems = await Promise.all(
    sources.map(async (s) => ({
      ...s,
      recentItems: (await listSourceItemsBySource(s.id, 5)).map((it) => ({
        id: it.id,
        title: it.title,
        url: it.url,
        fetchedAt: it.fetchedAt,
      })),
    })),
  );
  return NextResponse.json({ sources: withItems });
}

const postSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(200),
  type: z.enum(["rss", "url", "paste", "search_digest", "trend_digest"]),
  configJson: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().optional(),
  fetchIntervalHours: z.number().int().min(1).max(720).optional(),
  refreshNow: z.boolean().optional(),
});

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const id = await upsertContentSource({
    id: parsed.data.id,
    name: parsed.data.name,
    type: parsed.data.type,
    configJson: parsed.data.configJson ?? null,
    enabled: parsed.data.enabled,
    fetchIntervalHours: parsed.data.fetchIntervalHours,
  });
  if (parsed.data.refreshNow) {
    await enqueueEditorialJob({
      type: "ingest_sources",
      runAfter: new Date(),
    });
  }
  return NextResponse.json({ id });
}
