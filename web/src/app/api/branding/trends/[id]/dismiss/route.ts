import { NextResponse } from "next/server";
import { dismissSourceItem, getSourceItemById } from "@/lib/sources/contentSources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const item = await getSourceItemById(id);
  if (!item) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }
  await dismissSourceItem(id);
  return NextResponse.json({ ok: true });
}
