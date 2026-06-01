import { NextResponse } from "next/server";
import { z } from "zod";
import { runBrandCoachTurn } from "@/lib/brandCoach";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const draftSchema = z.object({
  title: z.string().max(300).optional(),
  format: z.string().max(32).optional(),
  ideaNotes: z.string().max(50_000).optional(),
  hook: z.string().max(8_000).optional(),
  body: z.string().max(50_000).optional(),
  articleBody: z.string().max(100_000).optional(),
  language: z.enum(["", "auto", "fr", "en"]).optional(),
});

const bodySchema = z.object({
  message: z.string().min(2).max(12_000),
  threadId: z.string().optional(),
  postId: z.string().optional(),
  scope: z.enum(["studio", "post"]).optional(),
  draft: draftSchema.optional(),
});

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const result = await runBrandCoachTurn(parsed.data);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, debug: result.debug },
      { status: 502 },
    );
  }
  return NextResponse.json({
    threadId: result.threadId,
    reply: result.reply,
    actions: result.actions,
    resolvedLanguage: result.resolvedLanguage.language,
    languageHint: result.resolvedLanguage.source,
    debug: result.debug,
  });
}
