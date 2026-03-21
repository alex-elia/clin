import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { actionQueue } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const status = (body as { status?: string }).status;
  const allowed = new Set(["pending", "reviewed", "dismissed", "deferred"]);
  if (!status || !allowed.has(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const db = getDb();
  const row = await db.query.actionQueue.findFirst({
    where: eq(actionQueue.id, id),
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db
    .update(actionQueue)
    .set({
      status,
      reviewedAt:
        status === "reviewed" || status === "dismissed" ? new Date() : null,
    })
    .where(eq(actionQueue.id, id));

  const updated = await db.query.actionQueue.findFirst({
    where: eq(actionQueue.id, id),
  });

  return NextResponse.json(updated);
}
