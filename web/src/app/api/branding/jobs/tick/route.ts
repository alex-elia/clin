import { NextResponse } from "next/server";
import { runEditorialJobTick } from "@/lib/editorial/editorialJobRunner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorize(req: Request): boolean {
  const secret = process.env.BRANDING_TICK_SECRET?.trim();
  if (!secret) return true;
  const header = req.headers.get("x-branding-tick-secret");
  const url = new URL(req.url);
  const query = url.searchParams.get("secret");
  return header === secret || query === secret;
}

export async function POST(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const result = await runEditorialJobTick();
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
