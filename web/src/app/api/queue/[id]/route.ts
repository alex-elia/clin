import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { actionQueue } from "@/db/schema";
import { queuePatchSchema } from "@/lib/queuePatch";

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

  const parsed = queuePatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const patch = parsed.data;
  const db = getDb();
  const row = await db.query.actionQueue.findFirst({
    where: eq(actionQueue.id, id),
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let status = row.status;
  let reviewedAt = row.reviewedAt ?? null;
  let outreachDecision = row.outreachDecision;
  const draftOutreach =
    patch.draftOutreach !== undefined ? patch.draftOutreach : row.draftOutreach;

  if (patch.outreachDecision !== undefined) {
    outreachDecision = patch.outreachDecision;
    if (patch.outreachDecision === "sent") {
      status = "reviewed";
      reviewedAt = new Date();
    } else if (patch.outreachDecision === "skipped") {
      status = "dismissed";
      reviewedAt = new Date();
    }
  }

  if (patch.status !== undefined) {
    status = patch.status;
    if (status === "reviewed" || status === "dismissed") {
      reviewedAt = new Date();
    } else if (status === "deferred") {
      reviewedAt = null;
    } else if (status === "pending") {
      reviewedAt = null;
    }
  }

  await db
    .update(actionQueue)
    .set({
      status,
      reviewedAt,
      outreachDecision,
      draftOutreach,
    })
    .where(eq(actionQueue.id, id));

  const updated = await db.query.actionQueue.findFirst({
    where: eq(actionQueue.id, id),
  });

  return NextResponse.json(updated);
}
