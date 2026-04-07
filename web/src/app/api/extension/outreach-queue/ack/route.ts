import { NextResponse } from "next/server";
import { z } from "zod";
import { findMemberById, updateMemberStatus } from "@/lib/outreachCampaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  memberId: z.string().min(1),
  outcome: z.enum(["sent", "skipped"]),
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
      { error: "Expected { memberId, outcome: 'sent' | 'skipped' }" },
      { status: 400 },
    );
  }
  const { memberId, outcome } = parsed.data;
  const row = await findMemberById(memberId);
  if (!row) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }
  await updateMemberStatus(
    memberId,
    outcome === "sent" ? "sent" : "skipped",
  );
  return NextResponse.json({ ok: true });
}
