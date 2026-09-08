import { NextResponse } from "next/server";
import { z } from "zod";
import { confirmContactDisconnected } from "@/lib/cleaningRemovalAck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  contactId: z.string().min(1),
});

/** Extension / manual handoff: mark a contact disconnected without a queue exec id. */
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
      { error: "Expected { contactId }" },
      { status: 400 },
    );
  }

  try {
    await confirmContactDisconnected(parsed.data.contactId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
