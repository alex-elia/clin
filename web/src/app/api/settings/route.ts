import { NextResponse } from "next/server";
import { z } from "zod";
import { getPaceForApi, updatePaceSettings } from "@/lib/pace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    queueBatchSize: z.number().int().optional(),
    minSecondsBetweenProfileOpens: z.number().int().optional(),
    minSecondsBetweenCaptures: z.number().int().optional(),
    captureMaxPerHour: z.number().int().optional(),
    paceJitterPercent: z.number().int().optional(),
  })
  .strict();

export async function GET() {
  const pace = await getPaceForApi();
  return NextResponse.json({
    pace,
    note: "Pacing reduces bursty behavior. Manual capture stays human-in-the-loop; optional hygiene automation (Settings) can open profiles from your local queue with the same capture limits.",
  });
}

export async function PATCH(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  await updatePaceSettings(parsed.data);
  const pace = await getPaceForApi();
  return NextResponse.json({ pace });
}
