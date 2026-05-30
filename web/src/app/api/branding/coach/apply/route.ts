import { NextResponse } from "next/server";
import { z } from "zod";
import { applyCoachActions } from "@/lib/brandCoachApply";
import { coachActionSchema } from "@/lib/brandCoachTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  actions: z.array(z.unknown()).max(20),
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
  const valid = parsed.data.actions.filter((a) => coachActionSchema.safeParse(a).success);
  const result = await applyCoachActions(valid);
  return NextResponse.json(result);
}
