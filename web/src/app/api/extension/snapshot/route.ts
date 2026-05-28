import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { extensionSnapshots } from "@/db/schema";
import { extensionSnapshotPayloadSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = extensionSnapshotPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  const id = crypto.randomUUID();
  const now = parsed.data.capturedAt
    ? new Date(parsed.data.capturedAt)
    : new Date();

  await db.insert(extensionSnapshots).values({
    id,
    kind: parsed.data.kind,
    sourceUrl: parsed.data.sourceUrl,
    payloadJson: parsed.data.payload,
    capturedAt: now,
  });

  return NextResponse.json({ ok: true, id });
}
