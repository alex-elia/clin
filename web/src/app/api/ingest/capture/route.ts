import { count, desc, gte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { captureSessions } from "@/db/schema";
import { ingestCapture } from "@/lib/ingest";
import { getPaceSettings } from "@/lib/pace";
import { capturePayloadSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = capturePayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  const pace = await getPaceSettings();

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [hourly] = await db
    .select({ n: count() })
    .from(captureSessions)
    .where(gte(captureSessions.capturedAt, hourAgo));

  if ((hourly?.n ?? 0) >= pace.captureMaxPerHour) {
    return NextResponse.json(
      {
        error: `Rolling hourly capture limit reached (${pace.captureMaxPerHour}). This is intentional — work in smaller batches.`,
      },
      {
        status: 429,
        headers: { "Retry-After": "300" },
      },
    );
  }

  const [latest] = await db
    .select({ capturedAt: captureSessions.capturedAt })
    .from(captureSessions)
    .orderBy(desc(captureSessions.capturedAt))
    .limit(1);

  if (latest?.capturedAt) {
    const elapsed = Date.now() - latest.capturedAt.getTime();
    const minMs = pace.minSecondsBetweenCaptures * 1000;
    if (elapsed < minMs) {
      const retry = Math.max(1, Math.ceil((minMs - elapsed) / 1000));
      return NextResponse.json(
        {
          error: `Minimum ${pace.minSecondsBetweenCaptures}s between captures. Wait ${retry}s and try again.`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(retry) },
        },
      );
    }
  }

  try {
    const result = await ingestCapture(db, parsed.data);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ingest failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
