import { NextResponse } from "next/server";
import { z } from "zod";
import { updateCleaningExecItem } from "@/lib/cleaningExecQueueList";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  suggestedComment: z.string().optional(),
  skip: z.boolean().optional(),
  regenerateComment: z.boolean().optional(),
  markDisconnected: z.boolean().optional(),
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
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { suggestedComment, skip, regenerateComment, markDisconnected } =
    parsed.data;
  if (
    !skip &&
    suggestedComment === undefined &&
    !regenerateComment &&
    !markDisconnected
  ) {
    return NextResponse.json({ error: "No changes requested." }, { status: 400 });
  }

  try {
    const item = await updateCleaningExecItem(id, {
      suggestedComment,
      skip,
      regenerateComment,
      markDisconnected,
    });
    return NextResponse.json({
      ok: true,
      item,
      skipped: skip === true,
      disconnected: markDisconnected === true,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
