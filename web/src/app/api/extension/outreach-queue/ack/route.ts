import { NextResponse } from "next/server";
import { z } from "zod";
import { findMemberById, updateMemberStatus } from "@/lib/outreachCampaigns";
import {
  logOutreachSend,
  rollSendGapAfterSuccess,
  getOutreachSendSettings,
} from "@/lib/outreachSend";
import { getSqlite } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  memberId: z.string().min(1),
  outcome: z.enum(["sent", "skipped", "failed", "reply_detected"]),
  action: z.string().optional(),
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
      {
        error:
          "Expected { memberId, outcome: sent|skipped|failed|reply_detected }",
      },
      { status: 400 },
    );
  }
  const { memberId, outcome, action, error } = parsed.data;
  const row = await findMemberById(memberId);
  if (!row) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  if (outcome === "sent") {
    await updateMemberStatus(memberId, "sent");
    const sqlite = getSqlite();
    sqlite
      .prepare(
        `UPDATE outreach_campaign_members SET message_sent_at = ? WHERE id = ?`,
      )
      .run(Date.now(), memberId);
    const settings = await getOutreachSendSettings();
    await rollSendGapAfterSuccess(settings);
  } else if (outcome === "skipped") {
    await updateMemberStatus(memberId, "skipped");
  } else if (outcome === "reply_detected") {
    const sqlite = getSqlite();
    sqlite
      .prepare(
        `UPDATE outreach_campaign_members SET message_reply_outcome = ? WHERE id = ?`,
      )
      .run("replied", memberId);
  }

  await logOutreachSend({
    campaignMemberId: memberId,
    contactId: row.contactId,
    action: action ?? "dm",
    outcome,
    error: error ?? null,
  });

  return NextResponse.json({ ok: true });
}
