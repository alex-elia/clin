import { NextResponse } from "next/server";
import { extensionImagesFromPost, primaryPostImage } from "@/lib/contentPostMedia";
import {
  formatPostForClipboard,
  listReadyPostsForExtension,
} from "@/lib/contentPosts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await listReadyPostsForExtension(30);
  const items = await Promise.all(
    rows.map(async (p) => {
      const images = extensionImagesFromPost(p.mediaJson);
      const primary = primaryPostImage(p.mediaJson);
      return {
        postId: p.id,
        title: p.title,
        format: p.format,
        scheduledAt: p.scheduledAt?.toISOString() ?? null,
        hook: p.hook,
        body: p.body,
        copyText: await formatPostForClipboard(p),
        images,
        primaryImage: primary,
      };
    }),
  );
  return NextResponse.json({
    count: items.length,
    items,
    hint:
      "Copy post text, download or copy the image in the extension, then paste on LinkedIn. Mark published when done.",
  });
}
