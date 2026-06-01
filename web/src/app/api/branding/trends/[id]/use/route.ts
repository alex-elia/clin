import { NextResponse } from "next/server";
import { z } from "zod";
import { createContentPost } from "@/lib/contentPosts";
import {
  getSourceItemById,
  markSourceItemUsed,
} from "@/lib/sources/contentSources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  createPost: z.boolean().optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const item = await getSourceItemById(id);
  if (!item) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  let json: unknown = {};
  try {
    const text = await req.text();
    if (text.trim()) json = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  await markSourceItemUsed(id);

  if (parsed.data.createPost !== false) {
    const ideaNotes = [
      item.excerpt ?? "",
      item.url ? `Source: ${item.url}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const postId = await createContentPost({
      title: item.title.slice(0, 120),
      status: "idea",
      ideaNotes: ideaNotes || item.title,
      sourceItemIds: [id],
    });
    return NextResponse.json({ ok: true, postId });
  }

  return NextResponse.json({ ok: true });
}
