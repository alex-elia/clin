import Link from "next/link";
import { notFound } from "next/navigation";
import { CampaignAutopilotPrepPanel } from "@/components/CampaignAutopilotPrepPanel";
import {
  CampaignDetailTabNav,
  campaignDetailTabHref,
  parseCampaignDetailTab,
} from "@/components/CampaignDetailTabNav";
import { CampaignFormFields } from "@/components/CampaignFormFields";
import { CampaignMemberMessagingPanel } from "@/components/CampaignMemberMessagingPanel";
import { CampaignOrchestrateButton } from "@/components/CampaignOrchestrateButton";
import { CampaignMemberIcpCheckButton } from "@/components/CampaignMemberIcpCheckButton";
import { CampaignMemberDraftForm } from "@/components/CampaignMemberDraftForm";
import { CampaignExecScrollRestore } from "@/components/CampaignExecScrollRestore";
import { CampaignScrollPreservingForm } from "@/components/CampaignScrollPreservingForm";
import { RecommendationPanel } from "@/components/RecommendationPanel";
import {
  LinkedInActivityBadge,
  linkedInActivityWarnBeforeEngage,
} from "@/components/LinkedInActivityBadge";
import { pickContactPlaybookFromEnvelope } from "@/lib/contactPlaybook";
import {
  ICP_ACTION_LABELS,
  ICP_MATCH_LABELS,
  icpFitForOutreachDraft,
  icpMatchBadgeClass,
} from "@/lib/campaignMemberIcpShared";
import { loadPendingEngageExecByMemberId } from "@/lib/campaignEngageQueue";
import { campaignMemberAnchorId } from "@/lib/campaignExecScroll";
import {
  memberNeedsInviteBeforeDm,
  isUsableOutreachCopy,
  statusLabelForMember,
} from "@/lib/outreachInviteWorkflow";
import { normalizeConnectionDegree } from "@/lib/connectionDegree";
import { RemoveFromCampaignForm } from "@/components/RemoveFromCampaignForm";
import {
  approveCampaignMemberReadyAction,
  clearCaptureTargetCampaignAction,
  markCampaignMemberConnectedAction,
  markCampaignMemberSentAction,
  markCampaignMemberSkippedAction,
  queueCampaignMemberEngageAction,
  reopenCampaignMemberDraftAction,
  setCaptureTargetAndActiveExtensionAction,
  setCaptureTargetCampaignAction,
  updateCampaignAction,
} from "@/app/actions";
import {
  getCampaignMessagingSummary,
  loadLatestMessagingThreadsByContactId,
  memberNeedsMessagingReply,
} from "@/lib/campaignMemberMessaging";
import { loadMemberOutreachExtras } from "@/lib/campaignMemberOutreach";
import {
  deriveMemberWorkflowPhase,
  WORKFLOW_PHASE_LABELS,
  workflowPhaseBadgeClass,
} from "@/lib/campaignMemberWorkflowShared";
import { listContactLlmExtensionsMap } from "@/lib/contactSqlExtras";
import {
  loadThreadAnalysesByContactIds,
  threadAnalysisKey,
} from "@/lib/inboxThreadAnalysisStore";
import { MANUAL_PASTE_THREAD_KEY } from "@/lib/pastedThreadText";
import {
  enrichCampaignMembers,
  enrichedMemberMatchesFilter,
  parseMemberReadinessFilter,
  pickNextProfileCaptureTarget,
  readinessFilterCounts,
  type MemberReadinessFilter,
} from "@/lib/campaignMemberReadiness";
import {
  getActiveOutreachCampaignId,
  getCaptureTargetCampaignId,
  getOutreachCampaign,
  listCampaignMembers,
} from "@/lib/outreachCampaigns";

export const dynamic = "force-dynamic";

function memberFilterHref(campaignId: string, key: MemberReadinessFilter) {
  return campaignDetailTabHref(
    campaignId,
    "exec",
    key === "all" ? undefined : key,
  );
}

function filterChipClass(active: boolean) {
  return active
    ? "clin-pill clin-pill-active" : "clin-pill";
}

function profileDepthBadgeClass(depth: "missing" | "thin" | "ok") {
  if (depth === "ok")
    return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100";
  if (depth === "thin")
    return "bg-amber-100 text-amber-950 dark:bg-amber-950/50 dark:text-amber-100";
  return "bg-red-100 text-red-900 dark:bg-red-950/50 dark:text-red-100";
}

const MEMBER_FILTER_GROUPS: {
  label: string;
  chips: { key: MemberReadinessFilter; label: string }[];
}[] = [
  {
    label: "Workflow",
    chips: [
      { key: "all", label: "All" },
      { key: "invite_step", label: "Invite step" },
      { key: "need_invite", label: "Need invite note" },
      { key: "review_invite", label: "Review invite note" },
      { key: "invite_ready", label: "Ready to invite" },
      { key: "awaiting_connection", label: "Invite sent" },
      { key: "followup_ready", label: "Ready for follow-up" },
      { key: "extension_ready", label: "Ready for extension" },
      { key: "engage_queued", label: "Engage queued" },
      { key: "done", label: "Sent / skipped" },
      { key: "conversation_active", label: "In outreach" },
      { key: "suggest_end", label: "Suggest end" },
      { key: "campaign_ended", label: "Ended" },
      { key: "needs_messaging_reply", label: "Awaiting reply" },
      { key: "needs_thread_capture", label: "Need thread" },
    ],
  },
  {
    label: "Prep",
    chips: [
      { key: "need_profile", label: "Need profile" },
      { key: "thin_profile", label: "Thin profile" },
      { key: "profile_ok", label: "Profile OK" },
      { key: "need_draft", label: "Need draft" },
      { key: "review_draft", label: "Review draft" },
    ],
  },
  {
    label: "ICP",
    chips: [
      { key: "icp_strong", label: "ICP strong" },
      { key: "icp_partial", label: "ICP partial" },
      { key: "icp_weak", label: "ICP weak" },
      { key: "icp_unknown", label: "ICP unclear" },
      { key: "icp_unchecked", label: "ICP not checked" },
    ],
  },
];

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    draftErr?: string;
    draftOk?: string;
    batchOk?: string;
    batchInfo?: string;
    draftWarn?: string;
    engageOk?: string;
    engageErr?: string;
    memberFilter?: string;
    tab?: string;
    focus?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const [campaign, membersRaw, activeId, captureTargetId] = await Promise.all([
    getOutreachCampaign(id),
    listCampaignMembers(id),
    getActiveOutreachCampaignId(),
    getCaptureTargetCampaignId(),
  ]);
  if (!campaign) notFound();
  const isActive = activeId === id;
  const isCaptureTarget = captureTargetId === id;

  const membersEnriched = await enrichCampaignMembers(membersRaw);
  const pendingEngageExecByMemberId = await loadPendingEngageExecByMemberId(
    membersRaw.map((r) => r.member.id),
  );
  const outreachExtras = await loadMemberOutreachExtras(
    membersRaw.map((r) => r.member.id),
  );
  const llmByContactId = listContactLlmExtensionsMap(
    membersRaw.map((r) => r.contact.id),
  );
  const messagingByContactId = await loadLatestMessagingThreadsByContactId(
    membersRaw.map((r) => ({
      id: r.contact.id,
      fullName: r.contact.fullName,
      linkedinUrlCanonical: r.contact.linkedinUrlCanonical,
    })),
  );
  const threadAnalysisPairs = membersRaw.flatMap((r) => {
    const pairs: { contactId: string; threadKey: string }[] = [];
    const thread = messagingByContactId.get(r.contact.id);
    if (thread) {
      pairs.push({ contactId: r.contact.id, threadKey: thread.threadKey });
    }
    const pasted = llmByContactId.get(r.contact.id)?.llmMessageContext?.trim();
    if (pasted && pasted.length >= 40) {
      pairs.push({
        contactId: r.contact.id,
        threadKey: MANUAL_PASTE_THREAD_KEY,
      });
    }
    return pairs;
  });
  const threadAnalyses = loadThreadAnalysesByContactIds(threadAnalysisPairs);
  const threadAnalysisByContactId = new Map<
    string,
    import("@/lib/inboxThreadAnalysisTypes").InboxThreadAnalysis | null
  >();
  for (const row of membersRaw) {
    const thread = messagingByContactId.get(row.contact.id);
    if (!thread) continue;
    const stored = threadAnalyses.get(
      threadAnalysisKey(row.contact.id, thread.threadKey),
    );
    threadAnalysisByContactId.set(row.contact.id, stored?.analysis ?? null);
  }
  const filterCtx = {
    messagingByContactId,
    outreachExtras,
    threadAnalysisByContactId,
    pendingEngageExecByMemberId,
  };
  const messagingSummary = getCampaignMessagingSummary(
    membersEnriched,
    messagingByContactId,
    outreachExtras,
  );
  const memberFilter = parseMemberReadinessFilter(sp.memberFilter);
  const tab = parseCampaignDetailTab(sp, {
    hasMembers: membersEnriched.length > 0,
  });
  const filterCounts = readinessFilterCounts(membersEnriched, filterCtx);
  const memberOrder = new Map(
    membersRaw.map((row, index) => [row.member.id, index]),
  );
  const members = membersEnriched
    .filter((m) => enrichedMemberMatchesFilter(m, memberFilter, filterCtx))
    .sort(
      (a, b) =>
        (memberOrder.get(a.member.id) ?? 0) -
        (memberOrder.get(b.member.id) ?? 0),
    );
  const nextCapture = pickNextProfileCaptureTarget(membersEnriched);
  const openMembers = membersEnriched.filter(
    (m) =>
      m.member.status !== "sent" &&
      m.member.status !== "skipped" &&
      m.member.status !== "closed",
  );
  const wfNeedProfile = openMembers.filter((m) => m.profileDepth !== "ok").length;
  const wfNeedIcp = openMembers.filter((m) => !m.icpCheckedAt).length;
  const wfFitToDraft = openMembers.filter((m) =>
    icpFitForOutreachDraft(m.icpMatch),
  );
  const wfNeedDraft = wfFitToDraft.filter((m) => {
    const invite = memberNeedsInviteBeforeDm({
      connectionDegree: m.contact.connectionDegree,
      outreachStep: m.member.outreachStep,
      connectionAcceptedAt: m.member.connectionAcceptedAt,
    });
    return invite
      ? !isUsableOutreachCopy(m.member.draftInviteNote)
      : !isUsableOutreachCopy(m.member.draftOutreach);
  }).length;
  const wfReviewDraft = openMembers.filter((m) => {
    const has =
      isUsableOutreachCopy(m.member.draftInviteNote) ||
      isUsableOutreachCopy(m.member.draftOutreach);
    return (
      has &&
      m.member.status !== "ready" &&
      m.member.status !== "followup_ready"
    );
  }).length;
  const wfExtensionReady = openMembers.filter(
    (m) =>
      m.member.status === "ready" || m.member.status === "followup_ready",
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/campaigns"
          className="clin-link text-sm"
        >
          ← Campaigns
        </Link>
        <h1 className="mt-2 clin-page-title">{campaign.name}</h1>
        {sp.draftErr ? (
          <p className="mt-3 whitespace-pre-wrap rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-100">
            {sp.draftErr}
          </p>
        ) : null}
        {sp.draftOk === "1" ? (
          <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Draft regenerated — see the member in{" "}
            <Link
              href={campaignDetailTabHref(id, "exec")}
              className="font-medium underline"
            >
              Execution
            </Link>
            .
          </p>
        ) : null}
        {sp.engageErr ? (
          <p className="mt-3 whitespace-pre-wrap rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-100">
            {sp.engageErr}
          </p>
        ) : null}
        {sp.engageOk === "1" ? (
          <p className="mt-3 rounded-md border border-fuchsia-200 bg-fuchsia-50 px-3 py-2 text-sm text-fuchsia-900 dark:border-fuchsia-900 dark:bg-fuchsia-950/40 dark:text-fuchsia-100">
            Queued for engage — run from{" "}
            <Link href="/cleaning" className="font-medium underline">
              Cleaning exec queue
            </Link>{" "}
            or the extension engage todo.
          </p>
        ) : null}
        {sp.batchInfo ? (
          <p className="mt-3 clin-callout text-sm text-clin-text">
            {sp.batchInfo}
          </p>
        ) : null}
        {sp.batchOk !== undefined && sp.batchOk !== "" ? (
          <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            Generated {sp.batchOk} draft(s).
            {sp.draftWarn ? (
              <span className="mt-1 block whitespace-pre-wrap text-amber-900 dark:text-amber-100">
                First error: {sp.draftWarn}
              </span>
            ) : null}
          </p>
        ) : null}
        {isActive ? (
          <p className="mt-1 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            Active for extension Outreach tab (ready drafts + Decisions queue).
          </p>
        ) : null}
        {isCaptureTarget ? (
          <p className="mt-1 text-sm font-medium text-sky-700 dark:text-sky-400">
            Capture target: LinkedIn imports from the extension are added to this campaign automatically.
          </p>
        ) : null}
      </div>

      <CampaignDetailTabNav campaignId={id} activeTab={tab} />

      {tab === "prep" ? (
        <div className="space-y-6 pt-2">
          <CampaignAutopilotPrepPanel campaignId={id} />

          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Campaign details</h2>
            <form action={updateCampaignAction} className="space-y-4 clin-card p-4">
              <CampaignFormFields
                submitLabel="Save"
                defaultName={campaign.name}
                defaultContext={campaign.contextText}
                defaultIcp={campaign.icpText ?? ""}
                defaultWriter={campaign.writerInstructions ?? ""}
                defaultSystemOverride={campaign.systemPromptOverride ?? ""}
                hiddenCampaignId={id}
              />
            </form>
          </section>

          <section className="rounded-lg border border-sky-200 bg-sky-50/60 p-4 dark:border-sky-900 dark:bg-sky-950/30">
            <h2 className="text-sm font-semibold text-clin-text">
              Extension: capture LinkedIn into this campaign
            </h2>
            <p className="mt-1 text-sm text-clin-muted">
              While this is set, every <strong className="font-medium">Capture (auto)</strong> from
              the Clin extension adds people to this list.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <form action={setCaptureTargetCampaignAction}>
                <input type="hidden" name="campaignId" value={id} />
                <button
                  type="submit"
                  disabled={isCaptureTarget}
                  className="rounded-md bg-sky-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-sky-600"
                >
                  Set as capture target
                </button>
              </form>
              {isCaptureTarget ? (
                <form action={clearCaptureTargetCampaignAction}>
                  <button
                    type="submit"
                    className="clin-btn-secondary text-sm px-3 py-2"
                  >
                    Clear capture target
                  </button>
                </form>
              ) : null}
              <form action={setCaptureTargetAndActiveExtensionAction}>
                <input type="hidden" name="campaignId" value={id} />
                <button
                  type="submit"
                  className="rounded-md border border-sky-600 px-3 py-2 text-sm font-medium text-sky-900 dark:border-sky-500 dark:text-sky-100"
                >
                  Capture target + active for Outreach tab
                </button>
              </form>
            </div>
          </section>
        </div>
      ) : (
        <div className="space-y-6 pt-2">
          <CampaignExecScrollRestore
            campaignId={id}
            focusMemberId={sp.focus}
          />
          <section className="clin-card p-4">
            <h2 className="text-sm font-semibold">Capture queue &amp; readiness</h2>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-6">
              <div className="rounded border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950/30">
                <p className="text-xs uppercase tracking-wide text-red-700 dark:text-red-300">
                  Need profile
                </p>
                <p className="mt-1 text-lg font-semibold text-red-900 dark:text-red-100">
                  {wfNeedProfile}
                </p>
              </div>
              <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/30">
                <p className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-300">
                  Need ICP
                </p>
                <p className="mt-1 text-lg font-semibold text-amber-900 dark:text-amber-100">
                  {wfNeedIcp}
                </p>
              </div>
              <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 dark:border-blue-900 dark:bg-blue-950/30">
                <p className="text-xs uppercase tracking-wide text-blue-700 dark:text-blue-300">
                  Need draft
                </p>
                <p className="mt-1 text-lg font-semibold text-blue-900 dark:text-blue-100">
                  {wfNeedDraft}
                </p>
              </div>
              <Link
                href={memberFilterHref(id, "review_draft")}
                className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-900 dark:bg-emerald-950/30"
              >
                <p className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                  Review draft
                </p>
                <p className="mt-1 text-lg font-semibold text-emerald-900 dark:text-emerald-100">
                  {wfReviewDraft}
                </p>
              </Link>
              <div className="rounded border border-violet-200 bg-violet-50 px-3 py-2 dark:border-violet-900 dark:bg-violet-950/30">
                <p className="text-xs uppercase tracking-wide text-violet-700 dark:text-violet-300">
                  Ready for extension
                </p>
                <p className="mt-1 text-lg font-semibold text-violet-900 dark:text-violet-100">
                  {wfExtensionReady}
                </p>
              </div>
              <div className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/40">
                <p className="text-xs uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
                  Open
                </p>
                <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {openMembers.length}
                </p>
              </div>
            </div>
            <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
              <Link
                href={memberFilterHref(id, "need_invite")}
                title="ICP strong or partial, invite path, empty connection note"
                className="rounded border border-orange-200 bg-orange-50 px-3 py-2 dark:border-orange-900 dark:bg-orange-950/30"
              >
                <p className="text-xs uppercase tracking-wide text-orange-800 dark:text-orange-300">
                  Need invite note
                </p>
                <p className="mt-1 text-lg font-semibold text-orange-950 dark:text-orange-100">
                  {filterCounts.need_invite}
                </p>
              </Link>
              <Link
                href={memberFilterHref(id, "review_invite")}
                title="Invite note drafted, still in draft. Review it, then click Ready to invite."
                className="rounded border border-orange-200 bg-orange-50 px-3 py-2 dark:border-orange-900 dark:bg-orange-950/30"
              >
                <p className="text-xs uppercase tracking-wide text-orange-800 dark:text-orange-300">
                  Review invite note
                </p>
                <p className="mt-1 text-lg font-semibold text-orange-950 dark:text-orange-100">
                  {filterCounts.review_invite}
                </p>
              </Link>
              <Link
                href={memberFilterHref(id, "invite_ready")}
                className="rounded border border-orange-200 bg-orange-50 px-3 py-2 dark:border-orange-900 dark:bg-orange-950/30"
              >
                <p className="text-xs uppercase tracking-wide text-orange-800 dark:text-orange-300">
                  Ready to invite
                </p>
                <p className="mt-1 text-lg font-semibold text-orange-950 dark:text-orange-100">
                  {filterCounts.invite_ready}
                </p>
              </Link>
              <Link
                href={memberFilterHref(id, "awaiting_connection")}
                className="rounded border border-orange-200 bg-orange-50 px-3 py-2 dark:border-orange-900 dark:bg-orange-950/30"
              >
                <p className="text-xs uppercase tracking-wide text-orange-800 dark:text-orange-300">
                  Invite sent
                </p>
                <p className="mt-1 text-lg font-semibold text-orange-950 dark:text-orange-100">
                  {filterCounts.awaiting_connection}
                </p>
              </Link>
              <Link
                href={memberFilterHref(id, "followup_ready")}
                className="rounded border border-sky-200 bg-sky-50 px-3 py-2 dark:border-sky-900 dark:bg-sky-950/30"
              >
                <p className="text-xs uppercase tracking-wide text-sky-800 dark:text-sky-300">
                  Ready for follow-up
                </p>
                <p className="mt-1 text-lg font-semibold text-sky-950 dark:text-sky-100">
                  {filterCounts.followup_ready}
                </p>
              </Link>
            </div>
            {membersEnriched.length > 0 ? (
              <div className="mt-3 space-y-2 text-xs text-clin-muted">
                <p>
                  Profiles:{" "}
                  <strong className="text-clin-text">
                    {filterCounts.need_profile} missing
                  </strong>
                  ,{" "}
                  <strong className="text-clin-text">
                    {filterCounts.thin_profile} thin
                  </strong>
                  ,{" "}
                  <strong className="text-clin-text">
                    {filterCounts.profile_ok} detailed
                  </strong>
                  . Drafts:{" "}
                  <strong className="text-clin-text">
                    {filterCounts.need_draft} empty
                  </strong>
                  ,{" "}
                  <strong className="text-clin-text">
                    {filterCounts.review_draft} to review
                  </strong>
                  ,{" "}
                  <strong className="text-clin-text">
                    {filterCounts.extension_ready} ready for extension
                  </strong>
                  . Invite:{" "}
                  <strong className="text-clin-text">
                    {filterCounts.need_invite} need note
                  </strong>
                  ,{" "}
                  <strong className="text-clin-text">
                    {filterCounts.review_invite} to review
                  </strong>
                  ,{" "}
                  <strong className="text-clin-text">
                    {filterCounts.invite_ready} ready to invite
                  </strong>
                  ,{" "}
                  <strong className="text-clin-text">
                    {filterCounts.awaiting_connection} invite sent
                  </strong>
                  ,{" "}
                  <strong className="text-clin-text">
                    {filterCounts.followup_ready} ready for follow-up
                  </strong>
                  .
                </p>
                {nextCapture ? (
                  <p>
                    <a
                      href={nextCapture.profileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="clin-link font-medium"
                    >
                      Open next profile to capture
                    </a>
                    {nextCapture.fullName ? (
                      <span className="text-clin-muted"> — {nextCapture.fullName}</span>
                    ) : null}
                  </p>
                ) : (
                  <p className="text-emerald-700 dark:text-emerald-400">
                    No open members need a richer capture.
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-clin-muted">
                No members yet — set this campaign as capture target in{" "}
                <Link
                  href={campaignDetailTabHref(id, "prep")}
                  className="clin-link font-medium"
                >
                  Preparation
                </Link>
                , then capture from LinkedIn.
              </p>
            )}
            <div className="mt-4">
              <CampaignOrchestrateButton campaignId={id} />
            </div>
          </section>

          <section>
        <h2 className="text-sm font-semibold">
          Members ({members.length}
          {memberFilter !== "all" ? ` / ${membersEnriched.length} total` : ""})
        </h2>
        {messagingSummary.sentCount > 0 || messagingSummary.endedCount > 0 ? (
          <p className="mt-1 text-xs text-clin-muted">
            {messagingSummary.sentCount} in outreach
            {messagingSummary.endedCount > 0
              ? ` · ${messagingSummary.endedCount} ended`
              : ""}
            {messagingSummary.needsReply > 0
              ? ` · ${messagingSummary.needsReply} awaiting reply`
              : ""}
            {messagingSummary.needsCapture > 0
              ? ` · ${messagingSummary.needsCapture} need thread capture`
              : ""}
          </p>
        ) : null}
        {membersEnriched.length > 0 ? (
          <div className="mt-2 space-y-2">
            {MEMBER_FILTER_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="text-[11px] font-medium uppercase tracking-wide text-clin-muted">
                  {group.label}
                </p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {group.chips.map(({ key, label }) => (
                    <Link
                      key={key}
                      href={memberFilterHref(id, key)}
                      className={filterChipClass(memberFilter === key)}
                    >
                      {label} ({filterCounts[key]})
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
        <p className="mt-1 text-xs text-clin-muted">
          <strong className="font-medium text-clin-muted">Remove from campaign</strong> deletes only
          this list row; the person stays in{" "}
          <Link href="/contacts" className="clin-link">
            Contacts
          </Link>
          .
        </p>
        <div className="mt-3 space-y-6">
          {membersEnriched.length === 0 ? (
            <p className="text-sm text-clin-muted">No contacts in this campaign yet.</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-clin-muted">
              {memberFilter === "need_invite"
                ? "Nobody is waiting for an empty invite note. After generate, they move to Review invite note. Ready to invite is only after you click Ready to invite on the card."
                : memberFilter === "review_invite"
                  ? "Nobody has an invite note waiting for review. Generate a note first, then mark Ready to invite when the text is good."
                  : memberFilter === "invite_ready"
                    ? "Nobody is marked ready to invite yet. Review the note, then click Ready to invite on the member card."
                    : "No members match this filter."}
            </p>
          ) : (
            members.map((row) => {
              const {
                member,
                contact,
                profileDepth,
                lastProfileCapturedAt,
                icpMatch,
                icpRationale,
                icpRecommendedAction,
                icpCheckedAt,
                activityTier,
                activityScore,
                newestPostAgeLabel,
              } = row;
              const draft = member.draftOutreach ?? "";
              const inviteNote = member.draftInviteNote ?? "";
              const needsInvite = memberNeedsInviteBeforeDm({
                connectionDegree: contact.connectionDegree,
                outreachStep: member.outreachStep,
                connectionAcceptedAt: member.connectionAcceptedAt,
              });
              const networkDegree =
                normalizeConnectionDegree(contact.connectionDegree);
              const hasInviteDraft = isUsableOutreachCopy(inviteNote);
              const hasFollowupDraft = isUsableOutreachCopy(draft);
              const hasDraft = needsInvite ? hasInviteDraft : hasFollowupDraft;
              const extras = outreachExtras.get(member.id);
              const llmExt = llmByContactId.get(contact.id);
              const contactPlaybook = pickContactPlaybookFromEnvelope(
                contact.id,
                llmExt?.llmProvisionalJson,
                llmExt?.llmRefinedJson,
              );
              const thread = messagingByContactId.get(contact.id) ?? null;
              const needsReply =
                member.status === "sent" &&
                memberNeedsMessagingReply({
                  memberStatus: member.status,
                  thread,
                  extras,
                });
              const captureAnalysis = thread
                ? (threadAnalyses.get(
                    threadAnalysisKey(contact.id, thread.threadKey),
                  )?.analysis ?? null)
                : null;
              const workflowPhase = deriveMemberWorkflowPhase({
                memberStatus: member.status,
                extras,
                thread,
                threadAnalysis: captureAnalysis,
                outreachStep: member.outreachStep,
              });
              const isPostSend =
                member.status === "sent" ||
                member.status === "skipped" ||
                member.status === "closed";
              const pendingEngageExecId =
                pendingEngageExecByMemberId.get(member.id) ?? null;
              const isEngagePath =
                member.status === "engage" || Boolean(pendingEngageExecId);
              const showWorkflowBadge =
                isPostSend ||
                member.status === "engage" ||
                member.status === "invite_sent" ||
                member.status === "followup_ready" ||
                member.status === "ready";
              const activityEngageWarn =
                linkedInActivityWarnBeforeEngage(activityTier);
              return (
                <div
                  key={member.id}
                  id={campaignMemberAnchorId(member.id)}
                  className="clin-card p-4 scroll-mt-24"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/contacts/${contact.id}`}
                        className="font-medium hover:underline"
                      >
                        {contact.fullName || contact.id}
                      </Link>
                      <span className="clin-pill text-xs">
                        {statusLabelForMember(member.status)}
                      </span>
                      <span
                        className="clin-pill text-xs"
                        title="LinkedIn network distance"
                      >
                        Network: {networkDegree ?? "unknown"}
                        {needsInvite ? " · invite first" : ""}
                      </span>
                      {pendingEngageExecId && member.status !== "engage" ? (
                        <span className="clin-pill border-fuchsia-400/40 text-xs text-fuchsia-900 dark:text-fuchsia-100">
                          engage pending
                        </span>
                      ) : null}
                      <LinkedInActivityBadge
                        tier={activityTier}
                        score={activityScore}
                        newestPostAgeLabel={newestPostAgeLabel}
                        compact
                      />
                      {showWorkflowBadge ? (
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs font-medium ${workflowPhaseBadgeClass(workflowPhase)}`}
                        >
                          {WORKFLOW_PHASE_LABELS[workflowPhase]}
                        </span>
                      ) : null}
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${profileDepthBadgeClass(profileDepth)}`}
                        title="From latest LinkedIn profile Capture in Clin"
                      >
                        Profile:{" "}
                        {profileDepth === "ok"
                          ? "detailed"
                          : profileDepth === "thin"
                            ? "thin"
                            : "missing"}
                      </span>
                      {icpMatch ? (
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs font-medium ${icpMatchBadgeClass(icpMatch)}`}
                          title={
                            icpCheckedAt
                              ? `Checked ${icpCheckedAt.toLocaleString()}`
                              : undefined
                          }
                        >
                          {ICP_MATCH_LABELS[icpMatch]}
                        </span>
                      ) : (
                        <span className="clin-pill text-xs text-[var(--clin-muted)]">
                          ICP not checked
                        </span>
                      )}
                      {icpRecommendedAction ? (
                        <span
                          className="clin-pill border-fuchsia-400/40 text-xs text-fuchsia-900 dark:text-fuchsia-100"
                          title={icpRationale ?? undefined}
                        >
                          {ICP_ACTION_LABELS[icpRecommendedAction]}
                        </span>
                      ) : null}
                      {member.status === "sent" && !thread ? (
                        <span className="clin-pill border-sky-400/50 text-xs text-sky-900 dark:text-sky-100">
                          Need thread
                        </span>
                      ) : null}
                      {needsReply ? (
                        <span className="clin-pill border-amber-400/50 text-xs text-amber-900 dark:text-amber-100">
                          Awaiting reply
                        </span>
                      ) : null}
                    </div>
                    <div className="flex min-w-0 flex-col items-end gap-1 text-right">
                      <p className="max-w-md truncate text-xs text-clin-muted">
                        {contact.headline}
                      </p>
                      {contact.linkedinUrlCanonical ? (
                        <a
                          href={contact.linkedinUrlCanonical}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs clin-link font-medium"
                        >
                          Open LinkedIn
                        </a>
                      ) : null}
                      {lastProfileCapturedAt ? (
                        <span className="text-[11px] text-clin-muted">
                          Last profile capture:{" "}
                          {lastProfileCapturedAt.toLocaleString(undefined, {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {contactPlaybook || icpRationale ? (
                    <RecommendationPanel
                      className="mt-3"
                      playbook={contactPlaybook}
                      icpRationale={icpRationale}
                    />
                  ) : null}
                  {member.status !== "closed" ? (
                    <>
                      <CampaignMemberDraftForm
                        campaignId={id}
                        memberId={member.id}
                        kind="invite"
                        label="Step 1: connection invite note"
                        initialDraft={inviteNote}
                        readOnly={!needsInvite && !hasInviteDraft}
                        lockedHint={
                          needsInvite
                            ? null
                            : hasInviteDraft
                              ? "Invite note kept on file. This contact is 1st degree or already accepted."
                              : "Already 1st degree: connection note is not used."
                        }
                      />
                      <CampaignMemberDraftForm
                        campaignId={id}
                        memberId={member.id}
                        kind="followup"
                        label="Step 2: follow-up DM"
                        initialDraft={draft}
                        collapsed={
                          needsInvite &&
                          member.status !== "followup_ready" &&
                          !member.connectionAcceptedAt
                        }
                        readOnly={
                          needsInvite &&
                          member.status !== "followup_ready" &&
                          !member.connectionAcceptedAt
                        }
                        lockedHint={
                          needsInvite &&
                          member.status !== "followup_ready" &&
                          !member.connectionAcceptedAt
                            ? "Waiting until they accept. Do not send this as the invite note."
                            : null
                        }
                      />
                    </>
                  ) : (
                    <>
                      {inviteNote.trim() ? (
                        <CampaignMemberDraftForm
                          campaignId={id}
                          memberId={member.id}
                          kind="invite"
                          label="Invite note"
                          initialDraft={inviteNote}
                          readOnly
                        />
                      ) : null}
                      {draft.trim() ? (
                        <CampaignMemberDraftForm
                          campaignId={id}
                          memberId={member.id}
                          kind="followup"
                          label="Follow-up DM"
                          initialDraft={draft}
                          readOnly
                        />
                      ) : null}
                    </>
                  )}
                  {isEngagePath ? (
                    <p className="mt-3 text-sm text-[var(--clin-muted)]">
                      Engage comment queued — run from{" "}
                      <Link href="/cleaning" className="clin-link font-medium">
                        Cleaning exec queue
                      </Link>
                      {pendingEngageExecId ? " (pending)" : ""}. You can still
                      draft a private message below and mark ready for extension
                      in parallel.
                    </p>
                  ) : null}
                  {extras?.inviteSentAt ? (
                    <p className="mt-2 text-xs text-clin-muted">
                      Invite sent:{" "}
                      {extras.inviteSentAt.toLocaleString(undefined, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </p>
                  ) : null}
                  {extras?.connectionAcceptedAt ? (
                    <p className="mt-2 text-xs text-clin-muted">
                      Connection accepted:{" "}
                      {extras.connectionAcceptedAt.toLocaleString(undefined, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </p>
                  ) : null}
                  {extras?.messageSentAt ? (
                    <p className="mt-2 text-xs text-clin-muted">
                      Sent (recorded):{" "}
                      {extras.messageSentAt.toLocaleString(undefined, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {member.status !== "closed" ? (
                      <>
                    <CampaignMemberIcpCheckButton
                      campaignId={id}
                      memberId={member.id}
                    />
                    {needsInvite &&
                    (member.status !== "ready" ||
                      member.outreachStep !== "invite") &&
                    member.status !== "followup_ready"
                      ? (
                      <CampaignScrollPreservingForm
                        campaignId={id}
                        action={approveCampaignMemberReadyAction}
                      >
                        <input type="hidden" name="campaignId" value={id} />
                        <input type="hidden" name="memberId" value={member.id} />
                        <button
                          type="submit"
                          disabled={!hasDraft}
                          className="rounded-md bg-emerald-700 px-2 py-1 text-xs text-white disabled:opacity-40"
                        >
                          Ready to invite
                        </button>
                      </CampaignScrollPreservingForm>
                    ) : !needsInvite &&
                      member.status !== "ready" &&
                      member.status !== "followup_ready" ? (
                      <CampaignScrollPreservingForm
                        campaignId={id}
                        action={approveCampaignMemberReadyAction}
                      >
                        <input type="hidden" name="campaignId" value={id} />
                        <input type="hidden" name="memberId" value={member.id} />
                        <button
                          type="submit"
                          disabled={!hasDraft}
                          className="rounded-md bg-emerald-700 px-2 py-1 text-xs text-white disabled:opacity-40"
                        >
                          Ready for extension
                        </button>
                      </CampaignScrollPreservingForm>
                    ) : (
                      <CampaignScrollPreservingForm
                        campaignId={id}
                        action={reopenCampaignMemberDraftAction}
                      >
                        <input type="hidden" name="campaignId" value={id} />
                        <input type="hidden" name="memberId" value={member.id} />
                        <button
                          type="submit"
                          className="clin-btn-secondary text-xs px-2 py-1"
                        >
                          Back to draft
                        </button>
                      </CampaignScrollPreservingForm>
                    )}
                    {!needsInvite &&
                    !pendingEngageExecId &&
                    member.status !== "sent" &&
                    member.status !== "skipped" ? (
                      <CampaignScrollPreservingForm
                        campaignId={id}
                        action={queueCampaignMemberEngageAction}
                      >
                        <input type="hidden" name="campaignId" value={id} />
                        <input type="hidden" name="memberId" value={member.id} />
                        <button
                          type="submit"
                          className="rounded-md bg-fuchsia-800 px-2 py-1 text-xs text-white dark:bg-fuchsia-700"
                          title="Generate AI comment and add to Cleaning engage queue"
                        >
                          Queue engage
                        </button>
                      </CampaignScrollPreservingForm>
                    ) : null}
                    {activityEngageWarn ? (
                      <p className="w-full text-xs text-amber-800 dark:text-amber-200">
                        {activityEngageWarn}
                      </p>
                    ) : null}
                    {member.status === "invite_sent" ? (
                      <CampaignScrollPreservingForm
                        campaignId={id}
                        action={markCampaignMemberConnectedAction}
                      >
                        <input type="hidden" name="campaignId" value={id} />
                        <input type="hidden" name="memberId" value={member.id} />
                        <button
                          type="submit"
                          className="rounded-md bg-orange-800 px-2 py-1 text-xs text-white dark:bg-orange-700"
                          title="Use if the extension scan missed the accept"
                        >
                          Mark connected
                        </button>
                      </CampaignScrollPreservingForm>
                    ) : null}
                    {member.status !== "sent" &&
                    member.status !== "skipped" &&
                    member.status !== "invite_sent" ? (
                      <>
                        <CampaignScrollPreservingForm
                          campaignId={id}
                          action={markCampaignMemberSentAction}
                        >
                          <input type="hidden" name="campaignId" value={id} />
                          <input type="hidden" name="memberId" value={member.id} />
                          <button
                            type="submit"
                            className="rounded-md bg-sky-800 px-2 py-1 text-xs text-white dark:bg-sky-700"
                            title="Use after you send on LinkedIn (same as extension). Optional: save draft in Clin first for your records."
                          >
                            {needsInvite
                              ? "Mark invite sent (manual)"
                              : "Mark sent (manual)"}
                          </button>
                        </CampaignScrollPreservingForm>
                        <CampaignScrollPreservingForm
                          campaignId={id}
                          action={markCampaignMemberSkippedAction}
                        >
                          <input type="hidden" name="campaignId" value={id} />
                          <input type="hidden" name="memberId" value={member.id} />
                          <button
                            type="submit"
                            className="clin-btn-secondary text-xs px-2 py-1"
                          >
                            Skip
                          </button>
                        </CampaignScrollPreservingForm>
                      </>
                    ) : null}
                      </>
                    ) : null}
                    <RemoveFromCampaignForm campaignId={id} memberId={member.id} />
                  </div>
                  <CampaignMemberMessagingPanel
                    campaignId={id}
                    memberId={member.id}
                    contactId={contact.id}
                    contactName={contact.fullName || contact.id}
                    memberStatus={member.status}
                    thread={thread}
                    extras={extras}
                    storedCaptureAnalysis={
                      thread
                        ? threadAnalyses.get(
                            threadAnalysisKey(contact.id, thread.threadKey),
                          ) ?? null
                        : null
                    }
                    storedPastedAnalysis={
                      threadAnalyses.get(
                        threadAnalysisKey(contact.id, MANUAL_PASTE_THREAD_KEY),
                      ) ?? null
                    }
                    initialPastedThread={
                      llmByContactId.get(contact.id)?.llmMessageContext ?? ""
                    }
                  />
                </div>
              );
            })
          )}
        </div>
      </section>
        </div>
      )}
    </div>
  );
}
