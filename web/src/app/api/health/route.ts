import { NextResponse } from "next/server";
import { getDb } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness for the Chrome extension and local tooling.
 * @see docs/DESIGN.md — Local API (minimal)
 */
export async function GET() {
  let dbOk = false;
  try {
    getDb();
    dbOk = true;
  } catch {
    dbOk = false;
  }

  return NextResponse.json({
    ok: true,
    service: "clin",
    db: dbOk,
    time: new Date().toISOString(),
  });
}
