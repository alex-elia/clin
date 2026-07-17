import { NextResponse } from "next/server";
import { z } from "zod";
import { loadLatestCoachThreadForUi } from "@/lib/contentCoachThreads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  scope: z.enum(["studio", "post", "home"]),
  postId: z.string().min(1).optional(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    scope: url.searchParams.get("scope") ?? undefined,
    postId: url.searchParams.get("postId") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query." }, { status: 400 });
  }
  if (parsed.data.scope === "post" && !parsed.data.postId) {
    return NextResponse.json(
      { error: "postId is required for post scope." },
      { status: 400 },
    );
  }

  try {
    const { threadId, messages } = await loadLatestCoachThreadForUi({
      scope: parsed.data.scope,
      postId: parsed.data.postId,
      limit: 40,
    });
    return NextResponse.json({
      threadId,
      messages: messages.slice(-24),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not load history.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
