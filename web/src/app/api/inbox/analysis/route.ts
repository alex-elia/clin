import { NextResponse } from "next/server";
import { z } from "zod";
import { getThreadAnalysis } from "@/lib/inboxThreadAnalysisStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  contactId: z.string().min(1),
  threadKey: z.string().min(1),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    contactId: url.searchParams.get("contactId") ?? "",
    threadKey: url.searchParams.get("threadKey") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "contactId and threadKey required" },
      { status: 400 },
    );
  }

  const stored = getThreadAnalysis(
    parsed.data.contactId,
    parsed.data.threadKey,
  );
  if (!stored) {
    return NextResponse.json({ ok: true, stored: null });
  }

  return NextResponse.json({
    ok: true,
    stored: {
      analysis: stored.analysis,
      messageCount: stored.messageCount,
      model: stored.model,
      analyzedAt: stored.analyzedAt.toISOString(),
    },
  });
}
