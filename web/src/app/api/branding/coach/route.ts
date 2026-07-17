import { NextResponse } from "next/server";
import { z } from "zod";
import { applyCoachActions } from "@/lib/brandCoachApply";
import { patchFromCoachAction } from "@/lib/brandCoachClient";
import { runBrandCoachTurn } from "@/lib/brandCoach";
import type { PostFormPatch } from "@/components/ContentPostWorkspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const draftSchema = z.object({
  title: z.string().max(300).optional(),
  format: z.string().max(32).optional(),
  ideaNotes: z.string().max(8_000).optional(),
  hook: z.string().max(2_000).optional(),
  body: z.string().max(10_000).optional(),
  articleBody: z.string().max(12_000).optional(),
  language: z.enum(["", "auto", "fr", "en"]).optional(),
});

const bodySchema = z.object({
  message: z.string().min(2).max(12_000),
  threadId: z.string().optional(),
  postId: z.string().optional(),
  scope: z.enum(["studio", "post", "home"]).optional(),
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
  let result;
  try {
    result = await runBrandCoachTurn(parsed.data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Coach failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        debug: result.debug,
        threadId: result.threadId,
      },
      { status: 502 },
    );
  }

  const isPostCoach =
    Boolean(parsed.data.postId) &&
    (parsed.data.scope === "post" || !parsed.data.scope);

  let savedToDb = false;
  let appliedCount = 0;
  let appliedFields: string[] = [];
  let applyErrors: string[] = [];
  let appliedPatch: PostFormPatch | undefined;
  let clientActions = result.actions;

  if (isPostCoach && result.actions.length > 0) {
    const updateAction = result.actions.find(
      (a) => a.type === "update_post",
    );
    if (updateAction) {
      appliedPatch = patchFromCoachAction(updateAction) ?? undefined;
    }
    const applied = await applyCoachActions(result.actions);
    savedToDb = applied.applied > 0;
    appliedCount = applied.applied;
    applyErrors = applied.errors;
    appliedFields = result.actions.flatMap((action) => {
      if (action.type !== "update_post" || !action.patch) return [];
      return Object.keys(action.patch);
    });
    if (savedToDb) {
      clientActions = [];
    }
  }

  return NextResponse.json({
    threadId: result.threadId,
    reply: result.reply,
    actions: clientActions,
    savedToDb,
    appliedCount,
    appliedFields,
    appliedPatch,
    applyErrors,
    resolvedLanguage: result.resolvedLanguage.language,
    languageHint: result.resolvedLanguage.source,
    llm: {
      provider: result.debug.provider,
      model: result.debug.model,
    },
    debug: result.debug,
  });
}
