import { NextResponse } from "next/server";
import { z } from "zod";
import { runCampaignPrepAutopilot } from "@/lib/campaignPrepAutopilot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  brief: z.string().min(12).max(4000),
  applyFields: z.boolean().optional(),
  suggestFromDatabase: z.boolean().optional(),
  suggestLimit: z.number().int().min(1).max(12).optional(),
  addContactIds: z.array(z.string()).optional(),
  verifyMembers: z.boolean().optional(),
  memberVerifyLimit: z.number().int().min(1).max(15).optional(),
  runPipeline: z.boolean().optional(),
  pipelineLimit: z.number().int().min(1).max(12).optional(),
  policy: z
    .object({
      draftOnReachOut: z.boolean().optional(),
      tagSkipAsGhost: z.boolean().optional(),
      tagNurtureAsWarm: z.boolean().optional(),
    })
    .optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: campaignId } = await ctx.params;
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const p = parsed.data;
  try {
    const result = await runCampaignPrepAutopilot({
      campaignId,
      brief: p.brief,
      applyFields: p.applyFields ?? true,
      suggestFromDatabase: p.suggestFromDatabase ?? true,
      suggestLimit: p.suggestLimit ?? 8,
      addSuggestedContactIds: p.addContactIds ?? [],
      verifyMembers: p.verifyMembers ?? true,
      memberVerifyLimit: p.memberVerifyLimit ?? 10,
      runPipeline: p.runPipeline ?? false,
      pipelineLimit: p.pipelineLimit ?? 6,
      policy: {
        draftOnReachOut: p.policy?.draftOnReachOut ?? true,
        tagSkipAsGhost: p.policy?.tagSkipAsGhost ?? false,
        tagNurtureAsWarm: p.policy?.tagNurtureAsWarm ?? false,
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Prep autopilot failed." },
      { status: 502 },
    );
  }
}
