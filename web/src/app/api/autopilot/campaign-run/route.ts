import { NextResponse } from "next/server";
import { z } from "zod";
import {
  autopilotActionPolicyFromSettings,
  getAutopilotSettings,
} from "@/lib/autopilot";
import {
  runCampaignAutopilot,
  type CampaignAutopilotMode,
} from "@/lib/campaignAutopilot";
import type { ProfileDepth } from "@/lib/campaignMemberReadiness";
import { runOrchestration } from "@/lib/telemetry/orchestration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z
  .object({
    campaignId: z.string().min(1),
    limit: z.number().int().min(1).max(20).optional(),
    mode: z
      .enum(["pending_analysis", "reanalyze_all", "actions_only"])
      .optional(),
    minProfileDepth: z.enum(["missing", "thin", "ok"]).optional(),
    runActions: z.boolean().optional(),
    policy: z
      .object({
        draftOnReachOut: z.boolean().optional(),
        tagSkipAsGhost: z.boolean().optional(),
        tagNurtureAsWarm: z.boolean().optional(),
      })
      .optional(),
  })
  .strict();

/**
 * Batch-analyze campaign members and optionally apply fit-based actions
 * (draft, segment tags, add to campaign).
 */
export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const settings = await getAutopilotSettings();
  const defaultPolicy = autopilotActionPolicyFromSettings(settings);
  const limit = parsed.data.limit ?? settings.batchDefaultLimit;
  const mode: CampaignAutopilotMode =
    parsed.data.mode ?? "pending_analysis";
  const minProfileDepth: ProfileDepth =
    parsed.data.minProfileDepth ?? "thin";
  const runActions = parsed.data.runActions ?? true;
  const policy = {
    ...defaultPolicy,
    ...parsed.data.policy,
  };

  try {
    const { result: run } = await runOrchestration({
      action: "campaign_autopilot",
      meta: {
        campaignId: parsed.data.campaignId,
        mode,
        limit: Math.min(20, limit),
        runActions,
      },
      fn: async (ctx) =>
        runCampaignAutopilot({
          campaignId: parsed.data.campaignId,
          limit: Math.min(20, limit),
          mode,
          minProfileDepth,
          policy,
          runActions,
          llmMeta: ctx.llmMeta,
        }),
    });
    const { campaignName, results } = run;
    const ok = results.filter((r) => r.ok).length;
    return NextResponse.json({
      ok: true,
      campaignName,
      processed: results.length,
      succeeded: ok,
      failed: results.length - ok,
      results,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
