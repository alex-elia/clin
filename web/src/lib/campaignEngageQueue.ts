import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { cleaningExecQueue, outreachCampaignMembers, outreachCampaigns } from "@/db/schema";
import { buildContactPlaybookFromAnalysis } from "@/lib/contactPlaybook";
import { pickLatestAnalysisView } from "@/lib/contactLlmDisplay";
import { selectContactLlmExtension } from "@/lib/contactSqlExtras";
import { selectContactActivityExtension } from "@/lib/contactActivitySqlExtras";
import { enqueueCleaningExec } from "@/lib/cleaningExecQueue";
import { generateEngageCommentForContact } from "@/lib/cleaningEngageComment";
import { readMemberIcpFromRow } from "@/lib/campaignMemberIcp";
import type { CampaignMemberIcpMatch } from "@/lib/campaignMemberIcpShared";
import { getLatestThreadAnalysisForContact } from "@/lib/inboxThreadAnalysisStore";
import { updateMemberStatus } from "@/lib/outreachCampaigns";
import { getLatestPostsCaptureJson } from "@/lib/profileCaptureContext";
import {
  MIN_ACTIVITY_SCORE_FOR_ENGAGE,
  activityTierAllowsEngage,
} from "@/lib/linkedinActivity";
import { pickFirstRecentPost } from "@/lib/profilePostRecency";

export type EnqueueCampaignEngageResult =
  | { ok: true; execId: string }
  | { ok: false; error: string; reason?: "no_recent_post" };

function parseEnvelope(raw: string | null | undefined): unknown {
  if (!raw?.trim()) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/** True when posts capture supports engage (recent post + activity score threshold). */
export async function contactHasRecentPostForEngage(
  contactId: string,
): Promise<boolean> {
  const activity = selectContactActivityExtension(contactId);
  if (activity?.activityTier != null) {
    if (activity.activityTier === "unknown") {
      const raw = await getLatestPostsCaptureJson(contactId);
      if (!raw?.profilePosts || !Array.isArray(raw.profilePosts)) return false;
      return (
        pickFirstRecentPost(
          raw.profilePosts as { text?: string; ageLabel?: string }[],
        ) != null
      );
    }
    if (!activityTierAllowsEngage(activity.activityTier)) return false;
    if (activity.activityScore != null) {
      return activity.activityScore >= MIN_ACTIVITY_SCORE_FOR_ENGAGE;
    }
  }

  const raw = await getLatestPostsCaptureJson(contactId);
  if (!raw?.profilePosts || !Array.isArray(raw.profilePosts)) return false;
  return (
    pickFirstRecentPost(
      raw.profilePosts as { text?: string; ageLabel?: string }[],
    ) != null
  );
}

/** Pending engage exec rows keyed by campaign member id (from payload). */
export async function loadPendingEngageExecByMemberId(
  memberIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (memberIds.length === 0) return map;

  const db = getDb();
  const rows = await db.query.cleaningExecQueue.findMany({
    where: and(
      eq(cleaningExecQueue.kind, "engage"),
      eq(cleaningExecQueue.status, "pending"),
    ),
  });

  const memberSet = new Set(memberIds);
  for (const row of rows) {
    const payload = row.payloadJson ?? {};
    const memberId =
      typeof payload.memberId === "string" ? payload.memberId : null;
    if (memberId && memberSet.has(memberId)) {
      map.set(memberId, row.id);
    }
  }
  return map;
}

export async function enqueueCampaignEngage(opts: {
  campaignId: string;
  memberId: string;
  contactId: string;
  /** When false, skip if no recent post capture (orchestration default). */
  requireRecentPost?: boolean;
}): Promise<EnqueueCampaignEngageResult> {
  const requireRecentPost = opts.requireRecentPost !== false;
  if (requireRecentPost) {
    const hasPost = await contactHasRecentPostForEngage(opts.contactId);
    if (!hasPost) {
      return {
        ok: false,
        error:
          "No recent post capture — scroll their LinkedIn activity and capture posts first.",
        reason: "no_recent_post",
      };
    }
  }

  const db = getDb();
  const [campaign, member] = await Promise.all([
    db.query.outreachCampaigns.findFirst({
      where: eq(outreachCampaigns.id, opts.campaignId),
    }),
    db.query.outreachCampaignMembers.findFirst({
      where: eq(outreachCampaignMembers.id, opts.memberId),
    }),
  ]);
  if (!campaign || !member) {
    return { ok: false, error: "Campaign or member not found." };
  }

  const storedIcp = readMemberIcpFromRow(member);
  const icpMatch: CampaignMemberIcpMatch =
    storedIcp.icpMatch ?? "partial";

  const llmExt = selectContactLlmExtension(opts.contactId);
  const rawRefined = parseEnvelope(llmExt?.llmRefinedJson);
  const rawProv = parseEnvelope(llmExt?.llmProvisionalJson);
  const analysis = pickLatestAnalysisView(rawRefined, rawProv);
  const threadStored = getLatestThreadAnalysisForContact(opts.contactId);
  const playbook = buildContactPlaybookFromAnalysis({
    analysis,
    rawOutput:
      (rawRefined as Record<string, unknown> | null) ??
      (rawProv as Record<string, unknown> | null),
    threadAnalysis: threadStored?.analysis ?? null,
    campaignOverlay: {
      campaignId: opts.campaignId,
      icp_match: icpMatch,
      recommended_action: "engage_comment",
    },
  });

  const generated = await generateEngageCommentForContact(opts.contactId, {
    campaignContext: {
      name: campaign.name,
      contextText: campaign.contextText,
      icpText: campaign.icpText,
    },
  });
  if (!generated.ok) {
    return { ok: false, error: generated.error };
  }

  const execId = await enqueueCleaningExec({
    contactId: opts.contactId,
    kind: "engage",
    payload: {
      suggestedComment: generated.comment,
      commentAngle:
        playbook?.posts_signals?.suggested_comment_angle?.trim() ?? null,
      engagementHook:
        playbook?.posts_signals?.engagement_hook?.trim() ?? null,
      playbook: playbook?.playbook?.trim() ?? null,
      rationale: playbook?.rationale?.trim() ?? null,
      campaignId: opts.campaignId,
      memberId: opts.memberId,
      source: "campaign",
    },
  });

  await updateMemberStatus(opts.memberId, "engage");
  return { ok: true, execId };
}
