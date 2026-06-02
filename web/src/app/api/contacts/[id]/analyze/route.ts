import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { contacts } from "@/db/schema";
import { executeContactAnalysis } from "@/lib/contactAnalyzeRunner";
import { getLlmConfig } from "@/lib/llm/completeChat";
import { contactAnalyzeBodySchema } from "@/lib/schemas";
import { trackTimedFeature } from "@/lib/telemetry/orchestration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = contactAnalyzeBodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  const row = await db.query.contacts.findFirst({
    where: eq(contacts.id, id),
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let llm;
  try {
    llm = await getLlmConfig();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Inference settings: ${msg}` },
      { status: 500 },
    );
  }

  let out;
  try {
    out = await trackTimedFeature(
      "contact_analyze",
      () => executeContactAnalysis(db, id, parsed.data, llm),
      { contactId: id },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        error: msg,
        llm: {
          provider: llm.provider,
          baseUrl: llm.baseUrl,
          model: llm.model,
        },
        ollama: { baseUrl: llm.baseUrl, model: llm.model },
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    tier: out.tier,
    envelope: out.envelope,
    contact: out.contact,
    llm: { provider: llm.provider, baseUrl: llm.baseUrl, model: llm.model },
    ollama: { baseUrl: llm.baseUrl, model: llm.model },
  });
}
