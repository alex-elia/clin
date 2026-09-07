import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { cleaningExecQueue } from "@/db/schema";
import { acknowledgeRemovalExec } from "@/lib/cleaningRemovalAck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  execId: z.string().min(1),
  outcome: z.enum(["disconnected", "skipped", "failed"]),
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
      { error: "Expected { execId, outcome: disconnected|skipped|failed }" },
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

  try {
    await acknowledgeRemovalExec(execId, outcome, error ?? null);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
