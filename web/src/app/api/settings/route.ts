import { NextResponse } from "next/server";
import { z } from "zod";
import { getPaceSettings, updatePaceSettings } from "@/lib/pace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    queueBatchSize: z.number().int().optional(),
    minSecondsBetweenProfileOpens: z.number().int().optional(),
    minSecondsBetweenCaptures: z.number().int().optional(),
    captureMaxPerHour: z.number().int().optional(),
  })
  .strict();

export async function GET() {
  const pace = await getPaceSettings();
  return NextResponse.json({
    pace,
    note: "Pacing reduces bursty behavior. It does not automate LinkedIn; you still perform every action manually.",
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
  const pace = await updatePaceSettings(parsed.data);
  return NextResponse.json({ pace });
}
