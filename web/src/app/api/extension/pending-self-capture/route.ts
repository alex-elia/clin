import { NextResponse } from "next/server";
import { getOrCreateUserContext } from "@/lib/userContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Clin extension polls this to open the user’s profile and run capture. */
export async function GET() {
  const ctx = await getOrCreateUserContext();
  const url = ctx.pendingSelfCaptureUrl?.trim() || null;
  const at = ctx.pendingSelfCaptureAt;
  if (!url || !at) {
    return NextResponse.json({
      url: null,
      requestedAt: null,
      contactId: ctx.selfContactId,
    });
  }
  return NextResponse.json({
    url,
    requestedAt: at.getTime(),
    contactId: ctx.selfContactId,
  });
}
