import { NextResponse } from "next/server";
import {
  getAutomationSettings,
  updateAutomationSettings,
} from "@/lib/automation";
import { automationSettingsPatchSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const automation = await getAutomationSettings();
  return NextResponse.json({ automation });
}

export async function PATCH(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = automationSettingsPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const automation = await updateAutomationSettings(parsed.data);
  return NextResponse.json({ automation });
}
