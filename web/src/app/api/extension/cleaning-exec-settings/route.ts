import { NextResponse } from "next/server";
import {
  getCleaningExecSettings,
  updateCleaningExecSettings,
  type CleaningExecSettingsPatch,
} from "@/lib/cleaningExecSettings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getCleaningExecSettings();
  return NextResponse.json({ cleaningExec: settings });
}

export async function PATCH(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!json || typeof json !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const b = json as Record<string, unknown>;
  const patch: CleaningExecSettingsPatch = {};
  if (typeof b.removalEnabled === "boolean") {
    patch.removalEnabled = b.removalEnabled;
  }
  if (typeof b.engageEnabled === "boolean") {
    patch.engageEnabled = b.engageEnabled;
  }
  if (typeof b.minSecondsBetweenActions === "number") {
    patch.minSecondsBetweenActions = b.minSecondsBetweenActions;
  }
  if (typeof b.maxPerDay === "number") {
    patch.maxPerDay = b.maxPerDay;
  }
  if (typeof b.jitterPercent === "number") {
    patch.jitterPercent = b.jitterPercent;
  }
  const settings = await updateCleaningExecSettings(patch);
  return NextResponse.json({ cleaningExec: settings });
}
