import { NextResponse } from "next/server";
import { exportJsonString } from "@/lib/dataExport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const body = exportJsonString();
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="clin-export-${stamp}.json"`,
    },
  });
}
