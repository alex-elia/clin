import { NextResponse } from "next/server";
import { generateCopyFromBrief } from "@/lib/copyAssistant";
import { generateCopyRequestSchema } from "@/lib/copyAssistantShared";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = generateCopyRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await generateCopyFromBrief(parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ text: result.text });
}
