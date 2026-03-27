import { count, desc, gte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { captureSessions } from "@/db/schema";
import {
  dedupeConnectionRows,
  ingestConnectionsPage,
} from "@/lib/ingest";
import {
  captureRequiredGapMs,
  getPaceSettings,
  rollCaptureGapAfterSuccess,
} from "@/lib/pace";
import { connectionsPagePayloadSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = connectionsPagePayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  const pace = await getPaceSettings();

  const uniqueRows = dedupeConnectionRows(parsed.data.rows);
  if (uniqueRows.length === 0) {
    return NextResponse.json(
      {
        error:
          "No valid /in/ profile links in payload (check URLs and duplicates).",
      },
      { status: 400 },
    );
  }

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [hourly] = await db
    .select({ n: count() })
    .from(captureSessions)
    .where(gte(captureSessions.capturedAt, hourAgo));

  const used = hourly?.n ?? 0;
  const slotsLeft = Math.max(0, pace.captureMaxPerHour - used);
  if (slotsLeft <= 0) {
    return NextResponse.json(
      {
        error: `Rolling hourly capture limit reached (${pace.captureMaxPerHour} capture rows). Raise the limit in /settings or wait.`,
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
    const requiredMs = await captureRequiredGapMs(pace);
    if (elapsed < requiredMs) {
      const retry = Math.max(1, Math.ceil((requiredMs - elapsed) / 1000));
      return NextResponse.json(
        {
          error: `Paced: wait ${retry}s before the next import (humanized interval).`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(retry) },
        },
      );
    }
  }

  try {
    const result = await ingestConnectionsPage(
      db,
      { ...parsed.data, rows: uniqueRows },
      { limit: slotsLeft, maxRows: 200 },
    );
    await rollCaptureGapAfterSuccess(pace);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ingest failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
