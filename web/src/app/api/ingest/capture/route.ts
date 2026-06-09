import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { maybeAutopilotThreadAnalysisAfterMessagingCapture } from "@/lib/campaignThreadAnalysis";
import { ingestCapture } from "@/lib/ingest";
import { attachImportedContactsToCampaign } from "@/lib/outreachCampaigns";
import {
  captureRequiredGapMs,
  countHourlyProfileCaptures,
  getPaceSettings,
  latestProfileCaptureAt,
  rollCaptureGapAfterSuccess,
} from "@/lib/pace";
import { maybeRunPostCaptureAnalysis } from "@/lib/postCaptureAnalysis";
import { capturePayloadSchema } from "@/lib/schemas";
import { trackFeatureEvent } from "@/lib/telemetry/orchestration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ANALYSIS_PAGE_TYPES = new Set([
  "profile",
  "posts",
  "messaging",
  "company",
  "company_jobs",
  "web_page",
]);

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = capturePayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  const pace = await getPaceSettings();

  const used = await countHourlyProfileCaptures();
  if (used >= pace.profileCaptureMaxPerHour) {
    return NextResponse.json(
      {
        error: `Rolling hourly profile capture limit reached (${pace.profileCaptureMaxPerHour}). List imports use a separate budget — work in smaller profile batches or wait.`,
      },
      {
        status: 429,
        headers: { "Retry-After": "300" },
      },
    );
  }

  const latest = await latestProfileCaptureAt();
  if (latest) {
    const elapsed = Date.now() - latest.getTime();
    const requiredMs = await captureRequiredGapMs(pace);
    if (elapsed < requiredMs) {
      const retry = Math.max(1, Math.ceil((requiredMs - elapsed) / 1000));
      return NextResponse.json(
        {
          error: `Paced: wait ${retry}s before the next profile capture (humanized interval).`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(retry) },
        },
      );
    }
  }

  const {
    outreachCampaignId,
    outreachMemberId,
    expectedParticipantProfileUrl,
    captureChainComplete,
    ...capturePayload
  } = parsed.data;
  const chainComplete = captureChainComplete !== false;
  const started = Date.now();

  try {
    const result = await ingestCapture(db, capturePayload, {
      outreachCampaignId,
      outreachMemberId,
      expectedParticipantProfileUrl,
    });
    await rollCaptureGapAfterSuccess(pace);

    const campaignAttach = await attachImportedContactsToCampaign(
      outreachCampaignId,
      [result.contactId],
    );

    if (capturePayload.pageType === "messaging") {
      maybeAutopilotThreadAnalysisAfterMessagingCapture(result.contactId);
    }

    if (!chainComplete) {
      trackFeatureEvent("capture_ingest", {
        ok: true,
        durationMs: Date.now() - started,
        meta: {
          pageType: capturePayload.pageType,
          contactId: result.contactId,
          analysisDeferred: true,
        },
      });
      return NextResponse.json({
        ...result,
        campaignAttach,
        analysisDeferred: true,
      });
    }

    if (ANALYSIS_PAGE_TYPES.has(capturePayload.pageType)) {
      maybeRunPostCaptureAnalysis({
        contactId: result.contactId,
        campaignId: campaignAttach.attachedToCampaignId,
      });
    }

    trackFeatureEvent("capture_ingest", {
      ok: true,
      durationMs: Date.now() - started,
      meta: {
        pageType: capturePayload.pageType,
        contactId: result.contactId,
      },
    });
    return NextResponse.json({ ...result, campaignAttach });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ingest failed";
    trackFeatureEvent("capture_ingest", {
      ok: false,
      durationMs: Date.now() - started,
      error: message,
      meta: { pageType: capturePayload.pageType },
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
