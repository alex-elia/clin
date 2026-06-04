import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getOutreachSendSettings,
  updateOutreachSendSettings,
} from "@/lib/outreachSend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  sendMode: z.enum(["auto", "manual_confirm"]).optional(),
});

export async function GET() {
  const outreachSend = await getOutreachSendSettings();
  return NextResponse.json({ outreachSend });
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
  const outreachSend = await updateOutreachSendSettings(parsed.data);
  return NextResponse.json({ outreachSend });
}
