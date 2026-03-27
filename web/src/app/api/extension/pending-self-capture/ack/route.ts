import { NextResponse } from "next/server";
import { getOrCreateUserContext, updateUserContext } from "@/lib/userContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Extension calls after a successful profile ingest for the pending job. */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const requestedAt =
    typeof body === "object" &&
    body !== null &&
    "requestedAt" in body &&
    typeof (body as { requestedAt: unknown }).requestedAt === "number"
      ? (body as { requestedAt: number }).requestedAt
      : null;
  if (requestedAt === null || !Number.isFinite(requestedAt)) {
    return NextResponse.json({ error: "requestedAt required" }, { status: 400 });
  }

  const ctx = await getOrCreateUserContext();
  const pendingAt = ctx.pendingSelfCaptureAt?.getTime();
  if (pendingAt !== requestedAt) {
    return NextResponse.json(
      { ok: false, reason: "stale_or_cleared" },
      { status: 409 },
    );
  }

  await updateUserContext({
    pendingSelfCaptureUrl: null,
    pendingSelfCaptureAt: null,
  });
  return NextResponse.json({ ok: true });
}
