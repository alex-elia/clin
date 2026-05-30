import { NextResponse } from "next/server";
import { z } from "zod";
import { markContentPostPublished } from "@/lib/contentPosts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  postId: z.string().min(1),
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
    return NextResponse.json({ error: "postId required." }, { status: 400 });
  }
  await markContentPostPublished(parsed.data.postId);
  return NextResponse.json({ ok: true });
}
