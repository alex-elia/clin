import { NextResponse } from "next/server";
import { getClinBrandPublic } from "@/lib/brand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getClinBrandPublic());
}
