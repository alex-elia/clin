import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import {
  getNetworkHygieneSnapshot,
  runNetworkHygienePipeline,
} from "@/lib/networkHygienePipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  refresh: z.boolean().optional(),
});

export async function GET(req: Request) {
  getDb();
  const url = new URL(req.url);
  const refresh = url.searchParams.get("refresh") === "1";
  try {
    const snapshot = await getNetworkHygieneSnapshot({ refresh });
    return NextResponse.json(snapshot);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  getDb();
  let json: unknown = {};
  try {
    json = await req.json();
  } catch {
    /* empty body is fine */
  }
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const snapshot = parsed.data.refresh
      ? await runNetworkHygienePipeline()
      : await getNetworkHygieneSnapshot({ refresh: true });
    return NextResponse.json(snapshot);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
