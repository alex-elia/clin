import { NextResponse } from "next/server";
import { getDb } from "@/db";
import {
  dedupeConnectionRows,
  ingestConnectionsPage,
} from "@/lib/ingest";
import { attachImportedContactsToCampaign } from "@/lib/outreachCampaigns";
import {
  countHourlyListImports,
  getPaceSettings,
  latestListImportAt,
  listImportRequiredGapMs,
  rollListImportGapAfterSuccess,
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

  const used = await countHourlyListImports();
  const slotsLeft = Math.max(0, pace.listImportMaxPerHour - used);
  if (slotsLeft <= 0) {
    return NextResponse.json(
      {
        error: `Rolling hourly list import limit reached (${pace.listImportMaxPerHour} shallow rows). Raise the limit in /settings or wait.`,
      },
      {
        status: 429,
        headers: { "Retry-After": "300" },
      },
    );
  }

  const latest = await latestListImportAt();
  if (latest) {
    const elapsed = Date.now() - latest.getTime();
    const requiredMs = await listImportRequiredGapMs(pace);
    if (elapsed < requiredMs) {
      const retry = Math.max(1, Math.ceil((requiredMs - elapsed) / 1000));
      return NextResponse.json(
        {
          error: `Paced: wait ${retry}s before the next list import (humanized interval).`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(retry) },
        },
      );
    }
  }

  const { outreachCampaignId, ...pagePayload } = parsed.data;

  try {
    const result = await ingestConnectionsPage(
      db,
      { ...pagePayload, rows: uniqueRows },
      { limit: slotsLeft, maxRows: 200 },
    );
    await rollListImportGapAfterSuccess(pace);
    const campaignAttach = await attachImportedContactsToCampaign(
      outreachCampaignId,
      result.touchedContactIds,
    );
    return NextResponse.json({ ...result, campaignAttach });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ingest failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
