import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { cleaningExecQueue, contacts } from "@/db/schema";
import { completeCleaningExec } from "@/lib/cleaningExecQueue";
import { findMemberById, updateMemberStatus } from "@/lib/outreachCampaigns";
import {
  getCleaningExecSettings,
  logCleaningExecAction,
  rollActionGapAfterSuccess,
} from "@/lib/cleaningExecSettings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  execId: z.string().min(1),
  outcome: z.enum(["commented", "skipped", "failed"]),
  error: z.string().optional(),
});

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Expected { execId, outcome: commented|skipped|failed }" },
      { status: 400 },
    );
  }

  const { execId, outcome, error } = parsed.data;
  const db = getDb();
  const row = await db.query.cleaningExecQueue.findFirst({
    where: eq(cleaningExecQueue.id, execId),
  });
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await completeCleaningExec({ id: execId, outcome, error: error ?? null });

  if (outcome === "commented") {
    const settings = await getCleaningExecSettings();
    await rollActionGapAfterSuccess(settings);

    const payload = row.payloadJson ?? {};
    const memberId =
      typeof payload.memberId === "string" ? payload.memberId.trim() : "";
    if (memberId) {
      const member = await findMemberById(memberId);
      if (member?.status === "engage") {
        await updateMemberStatus(memberId, "draft");
      }
    }
  }

  await logCleaningExecAction({
    contactId: row.contactId,
    kind: "engage",
    outcome,
    error: error ?? null,
  });

  await db
    .update(contacts)
    .set({ lastUpdatedAt: new Date() })
    .where(eq(contacts.id, row.contactId));

  return NextResponse.json({ ok: true });
}
