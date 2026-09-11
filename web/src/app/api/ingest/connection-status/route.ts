import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contacts, outreachCampaignMembers } from "@/db/schema";
import { canonicalizeLinkedInUrl } from "@/lib/url";
import { markCampaignMemberConnected } from "@/lib/campaignInviteLifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StatusRow = {
  profileUrl?: string;
  state?: string;
};

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const body = json as { rows?: StatusRow[] };
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, matched: 0, accepted: 0, pending: 0 });
  }

  const byUrl = new Map<string, string>();
  for (const row of rows) {
    const canonical = row.profileUrl
      ? canonicalizeLinkedInUrl(row.profileUrl)
      : null;
    if (!canonical) continue;
    const state = (row.state ?? "unknown").toLowerCase();
    byUrl.set(canonical, state);
  }

  const db = getDb();
  const pending = await db.query.outreachCampaignMembers.findMany({
    where: eq(outreachCampaignMembers.status, "invite_sent"),
  });

  let matched = 0;
  let accepted = 0;
  let stillPending = 0;

  for (const member of pending) {
    const contact = await db.query.contacts.findFirst({
      where: eq(contacts.id, member.contactId),
    });
    const url = contact?.linkedinUrlCanonical;
    if (!url) continue;
    const state = byUrl.get(url);
    if (!state) continue;
    matched += 1;
    if (state === "connected" || state === "1st") {
      const result = await markCampaignMemberConnected(member.id);
      if (result.ok) accepted += 1;
    } else if (state === "pending") {
      stillPending += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    matched,
    accepted,
    pending: stillPending,
  });
}
