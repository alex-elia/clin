import { NextResponse } from "next/server";
import { z } from "zod";
import { CLEANING_BUCKETS } from "@/lib/cleaningBuckets";
import { runCleaningBatchAction } from "@/lib/cleaningActions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  contactIds: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum([
    "accept",
    "override",
    "dismiss",
    "defer",
    "enqueue_review",
    "enqueue_engage",
  ]),
  bucket: z.enum(CLEANING_BUCKETS).optional(),
});

export async function POST(req: Request) {
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

  const { contactIds, action, bucket } = parsed.data;
  if (action === "override" && !bucket) {
    return NextResponse.json(
      { error: "bucket is required for override action" },
      { status: 400 },
    );
  }

  const results = await runCleaningBatchAction({
    contactIds,
    action,
    bucket,
  });

  return NextResponse.json({ results });
}
