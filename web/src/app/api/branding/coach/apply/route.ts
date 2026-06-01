import { NextResponse } from "next/server";
import { z } from "zod";
import { applyCoachActions } from "@/lib/brandCoachApply";
import { coachActionSchema } from "@/lib/brandCoachTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  actions: z.array(z.unknown()).max(20),
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
  const valid = parsed.data.actions.filter((a) => coachActionSchema.safeParse(a).success);
  const result = await applyCoachActions(valid);

  const draftingIds = new Set<string>();
  for (const raw of valid) {
    const parsedAction = coachActionSchema.safeParse(raw);
    if (!parsedAction.success) continue;
    const action = parsedAction.data;
    if (
      action.type === "update_post" &&
      action.patch?.status === "drafting"
    ) {
      draftingIds.add(action.postId);
    }
  }
  if (draftingIds.size > 0 || result.createdPostIds.length > 0) {
    const { getContentPostById } = await import("@/lib/contentPosts");
    const { maybeTriggerEditorialDraftForPost } = await import(
      "@/lib/editorial/editorialJobRunner"
    );
    for (const id of result.createdPostIds) {
      const post = await getContentPostById(id);
      if (post?.status === "drafting") draftingIds.add(id);
    }
    for (const id of draftingIds) {
      void maybeTriggerEditorialDraftForPost(id);
    }
  }

  return NextResponse.json(result);
}
