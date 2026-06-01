import { NextResponse } from "next/server";
import { z } from "zod";
import { getContentPostById } from "@/lib/contentPosts";
import {
  buildImagePromptFromPost,
  loadBrandImageContext,
  mergePostForImagePrompt,
  type PostImageDraft,
} from "@/lib/postImagePrompt";
import { parsePostImageStyle } from "@/lib/postImageStyle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const draftSchema = z.object({
  title: z.string().max(300).optional(),
  format: z.string().max(32).optional(),
  ideaNotes: z.string().max(50_000).optional(),
  hook: z.string().max(8_000).optional(),
  body: z.string().max(50_000).optional(),
  articleBody: z.string().max(100_000).optional(),
  language: z.string().max(8).optional(),
});

const bodySchema = z.object({
  postId: z.string(),
  imageStyle: z.enum(["photo", "text_card"]).optional(),
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

  const post = await getContentPostById(parsed.data.postId);
  if (!post) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  const source = mergePostForImagePrompt(
    post,
    parsed.data.draft as PostImageDraft | undefined,
  );
  const brand = await loadBrandImageContext();
  const imageStyle = parsePostImageStyle(parsed.data.imageStyle);
  const built = await buildImagePromptFromPost(source, brand, imageStyle);

  return NextResponse.json({
    prompt: built.prompt,
    source: built.source,
    imageStyle,
  });
}
