import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { contacts } from "@/db/schema";
import {
  persistLlmAnalysis,
  selectContactLlmExtension,
  tryUpdateLlmMessageContext,
} from "@/lib/contactSqlExtras";
import {
  inferAnalysisTier,
  runContactLlmAnalysis,
} from "@/lib/llmAnalysis";
import { getOllamaSettings } from "@/lib/ollamaSettings";
import { contactAnalyzeBodySchema } from "@/lib/schemas";

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

  let ollama;
  try {
    ollama = await getOllamaSettings();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Ollama settings: ${msg}` },
      { status: 500 },
    );
  }

  const storedMsg =
    selectContactLlmExtension(id)?.llmMessageContext ?? null;
  const msgCtx =
    parsed.data.messageContext !== undefined
      ? parsed.data.messageContext
      : storedMsg;

  if (parsed.data.persistMessageContext && parsed.data.messageContext !== undefined) {
    tryUpdateLlmMessageContext(id, parsed.data.messageContext);
  }

  const tierIn =
    parsed.data.tier === "auto"
      ? await inferAnalysisTier(db, id, msgCtx)
      : parsed.data.tier;

  let result;
  try {
    result = await runContactLlmAnalysis(db, {
      contactId: id,
      tier: tierIn,
      messageContext: msgCtx,
      settings: ollama,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: msg, ollama: { baseUrl: ollama.baseUrl, model: ollama.model } },
      { status: 502 },
    );
  }

  const jsonStr = JSON.stringify(result.envelope);
  persistLlmAnalysis(id, result.tier, jsonStr, ollama.model);

  const updated = await db.query.contacts.findFirst({
    where: eq(contacts.id, id),
  });
  const llm = selectContactLlmExtension(id);

  return NextResponse.json({
    ok: true,
    tier: result.tier,
    envelope: result.envelope,
    contact: updated
      ? { ...updated, ...(llm ?? {}) }
      : updated,
    ollama: { baseUrl: ollama.baseUrl, model: ollama.model },
  });
}
