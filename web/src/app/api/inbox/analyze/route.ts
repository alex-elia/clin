import { NextResponse } from "next/server";
import { getLlmConfig } from "@/lib/llm/completeChat";
import { runInboxThreadAnalysis } from "@/lib/inboxThreadAnalysis";
import { inboxAnalyzeBodySchema } from "@/lib/schemas";
import { trackTimedFeature } from "@/lib/telemetry/orchestration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = inboxAnalyzeBodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

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

  try {
    const out = await trackTimedFeature(
      "inbox_thread_analyze",
      () =>
        runInboxThreadAnalysis({
          contactId: parsed.data.contactId,
          threadKey: parsed.data.threadKey,
          settings: llm,
        }),
      { contactId: parsed.data.contactId },
    );

    return NextResponse.json({
      ok: true,
      ...out,
      llm: { provider: llm.provider, baseUrl: llm.baseUrl, model: llm.model },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        error: msg,
        llm: { provider: llm.provider, baseUrl: llm.baseUrl, model: llm.model },
      },
      { status: 502 },
    );
  }
}
