import { NextResponse } from "next/server";

/**
 * Liveness for the Chrome extension and local tooling.
 * @see docs/DESIGN.md — Local API (minimal)
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "clin",
    time: new Date().toISOString(),
  });
}
