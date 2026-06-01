import { NextResponse } from "next/server";
import { z } from "zod";
import { getContentPostById, updateContentPost } from "@/lib/contentPosts";
import type { ContentMediaJson } from "@/db/schema";
import {
  resolveImagePromptForPost,
  type PostImageDraft,
} from "@/lib/postImagePrompt";
import { mediaUrlToFilename } from "@/lib/contentPostMedia";
import { parsePostImageStyle } from "@/lib/postImageStyle";
import { generatePostImage } from "@/lib/stableDiffusion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const draftSchema = z.object({
  title: z.string().max(300).optional(),
  format: z.string().max(32).optional(),
  ideaNotes: z.string().max(50_000).optional(),
  hook: z.string().max(8_000).optional(),
  body: z.string().max(50_000).optional(),
  articleBody: z.string().max(100_000).optional(),
});

const bodySchema = z
  .object({
    postId: z.string(),
    prompt: z.string().max(2000).optional(),
    autoFromPost: z.boolean().optional(),
    negativePrompt: z.string().max(500).optional(),
    imageStyle: z.enum(["photo", "text_card"]).optional(),
    draft: draftSchema.optional(),
  })
  .refine(
    (d) =>
      (d.prompt?.trim().length ?? 0) >= 8 ||
      d.autoFromPost === true,
    { message: "Provide prompt or autoFromPost." },
  );

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

  const imageStyle = parsePostImageStyle(parsed.data.imageStyle);
  const resolved = await resolveImagePromptForPost({
    post,
    draft: parsed.data.draft as PostImageDraft | undefined,
    prompt: parsed.data.prompt,
    autoFromPost: parsed.data.autoFromPost,
    imageStyle,
  });
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }

  const result = await generatePostImage({
    postId: parsed.data.postId,
    prompt: resolved.prompt,
    negativePrompt: parsed.data.negativePrompt,
    imageStyle,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const existing = post.mediaJson?.items ?? [];
  const mediaJson: ContentMediaJson = {
    items: [
      ...existing,
      {
        kind: "image",
        url: result.apiUrl,
        filename: mediaUrlToFilename(result.apiUrl) ?? undefined,
        style: imageStyle,
        note: result.prompt.slice(0, 200),
        alt:
          imageStyle === "text_card"
            ? "Generated quote graphic"
            : "Generated post photo",
      },
    ],
  };

  await updateContentPost(parsed.data.postId, { mediaJson });

  return NextResponse.json({
    ok: true,
    imageUrl: result.apiUrl,
    relativePath: result.relativePath,
    filename: mediaUrlToFilename(result.apiUrl),
    imageStyle,
    prompt: result.prompt,
    promptSource: resolved.promptSource,
    promptGenerated: resolved.generated,
    imageProvider: result.provider,
    usedOvhFallback: result.usedOvhFallback,
  });
}
