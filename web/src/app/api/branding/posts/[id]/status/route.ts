import { NextResponse } from "next/server";
import { z } from "zod";
import {
  CONTENT_POST_STATUSES,
  type ContentPostStatus,
} from "@/lib/contentPostsShared";
import { updateContentPost } from "@/lib/contentPosts";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  status: z.enum(CONTENT_POST_STATUSES),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, context: RouteContext) {
  const { id } = await context.params;
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Expected { status: ContentPostStatus }" },
      { status: 400 },
    );
  }

  const nextStatus = parsed.data.status as ContentPostStatus;
  const ok = await updateContentPost(id, { status: nextStatus });
  if (!ok) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  if (nextStatus === "drafting") {
    const { maybeTriggerEditorialDraftForPost } = await import(
      "@/lib/editorial/editorialJobRunner"
    );
    void maybeTriggerEditorialDraftForPost(id);
  }

  revalidatePath("/branding/calendar");
  revalidatePath("/branding/studio");
  revalidatePath(`/branding/posts/${id}`);

  return NextResponse.json({ ok: true, status: nextStatus });
}
