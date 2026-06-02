import Link from "next/link";
import { notFound } from "next/navigation";
import { CampaignAutopilotPrepPanel } from "@/components/CampaignAutopilotPrepPanel";
import { CampaignFormFields } from "@/components/CampaignFormFields";
import { CampaignOrchestrateButton } from "@/components/CampaignOrchestrateButton";
import { CampaignMemberIcpCheckButton } from "@/components/CampaignMemberIcpCheckButton";
import {
  ICP_ACTION_LABELS,
  ICP_MATCH_LABELS,
  icpMatchBadgeClass,
} from "@/lib/campaignMemberIcpShared";
import { RemoveFromCampaignForm } from "@/components/RemoveFromCampaignForm";
import {
  approveCampaignMemberReadyAction,
  clearCaptureTargetCampaignAction,
  generateOneOutreachDraftAction,
  markCampaignMemberSentAction,
  markCampaignMemberSkippedAction,
  reopenCampaignMemberDraftAction,
  saveCampaignMemberDraftAction,
  setCaptureTargetAndActiveExtensionAction,
  setCaptureTargetCampaignAction,
  updateCampaignAction,
  updateMemberReplyOutcomeAction,
} from "@/app/actions";
import { loadMemberOutreachExtras } from "@/lib/campaignMemberOutreach";
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
  return key === "all"
    ? `/campaigns/${campaignId}`
    : `/campaigns/${campaignId}?memberFilter=${key}`;
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

const MEMBER_FILTER_CHIPS: { key: MemberReadinessFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "need_profile", label: "Need profile" },
  { key: "thin_profile", label: "Thin profile" },
  { key: "profile_ok", label: "Profile OK" },
  { key: "need_draft", label: "Need draft" },
  { key: "has_draft", label: "Has draft" },
  { key: "extension_ready", label: "Ready (extension)" },
  { key: "done", label: "Sent / skipped" },
  { key: "icp_strong", label: "ICP strong" },
  { key: "icp_partial", label: "ICP partial" },
  { key: "icp_weak", label: "ICP weak" },
  { key: "icp_unknown", label: "ICP unclear" },
  { key: "icp_unchecked", label: "ICP not checked" },
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
    memberFilter?: string;
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
  const outreachExtras = await loadMemberOutreachExtras(
    membersRaw.map((r) => r.member.id),
  );
  const memberFilter = parseMemberReadinessFilter(sp.memberFilter);
  const filterCounts = readinessFilterCounts(membersEnriched);
  const members = membersEnriched.filter((m) =>
    enrichedMemberMatchesFilter(m, memberFilter),
  );
  const nextCapture = pickNextProfileCaptureTarget(membersEnriched);
  const openMembers = membersEnriched.filter(
    (m) => m.member.status !== "sent" && m.member.status !== "skipped",
  );
  const wfNeedProfile = openMembers.filter((m) => m.profileDepth !== "ok").length;
  const wfNeedIcp = openMembers.filter((m) => !m.icpCheckedAt).length;
  const wfFitToDraft = openMembers.filter(
    (m) => m.icpMatch === "strong" || m.icpMatch === "partial",
  );
  const wfNeedDraft = wfFitToDraft.filter(
    (m) => !(m.member.draftOutreach ?? "").trim(),
  ).length;
  const wfReady = openMembers.filter((m) => m.member.status === "ready").length;

  return (
    <div className="space-y-8">
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
            Draft regenerated — check the text area below.
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

      <section className="clin-callout">
        <h2 className="text-sm font-semibold text-clin-text">Practical flow</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-clin-muted">
          <li>
            Refine <strong className="font-medium">name + context</strong> below (what you want local AI to respect for every message).
          </li>
          <li>
            <strong className="font-medium">Capture LinkedIn into this campaign</strong> (button below). Then search
            LinkedIn, open profiles or list pages, and use <strong className="font-medium">Capture</strong> in the
            extension — Clin adds each person here. On profiles, scroll <strong className="font-medium">About</strong>,{" "}
            <strong className="font-medium">Experience</strong>, and <strong className="font-medium">Education</strong>{" "}
            into view first so more detail is stored; LinkedIn DMs are not visible to Clin.
          </li>
          <li>
            Use <strong className="font-medium">Regenerate (LLM)</strong> on a member row or generate from the extension
            on an open profile.
          </li>
          <li>
            Edit drafts, then <strong className="font-medium">Ready for extension</strong>. Use{" "}
            <strong className="font-medium">Capture target + active for Outreach tab</strong> above so the extension
            lists ready sends. The extension <strong className="font-medium">fetches</strong> from your local API when
            you open or refresh it.
          </li>
          <li>
            After you send on LinkedIn yourself, click <strong className="font-medium">Mark sent (manual)</strong> on the
            member row below (or the same button in the extension Outreach tab). Use <strong className="font-medium">Skip</strong>{" "}
            if you will not message them.
          </li>
        </ol>
      </section>

      <CampaignAutopilotPrepPanel campaignId={id} />

      <section className="clin-callout">
        <h2 className="text-sm font-semibold text-clin-text">
          Workflow status (capture {"->"} ICP {"->"} draft {"->"} ready)
        </h2>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
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
              Need ICP check
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
          <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-900 dark:bg-emerald-950/30">
            <p className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
              Ready for extension
            </p>
            <p className="mt-1 text-lg font-semibold text-emerald-900 dark:text-emerald-100">
              {wfReady}
            </p>
          </div>
          <div className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/40">
            <p className="text-xs uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
              Open members
            </p>
            <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {openMembers.length}
            </p>
          </div>
        </div>
        <p className="mt-2 text-xs text-clin-muted">
          New profile captures now auto-run ICP analysis; when fit is strong/partial,
          Clin auto-generates a draft.
        </p>
        <CampaignOrchestrateButton campaignId={id} />
      </section>

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
          <p className="text-xs text-clin-muted">
            Per-contact draft logs:{" "}
            <code className="clin-code">[clin:outreach-draft]</code> in the dev
            terminal.
          </p>
        </form>
      </section>

      <section className="rounded-lg border border-sky-200 bg-sky-50/60 p-4 dark:border-sky-900 dark:bg-sky-950/30">
        <h2 className="text-sm font-semibold text-clin-text">
          Extension: capture LinkedIn into this campaign
        </h2>
        <p className="mt-1 text-sm text-clin-muted">
          While this is set, every profile or list <strong className="font-medium">Capture</strong> from the Clin
          extension tags new/updated people into <strong className="font-medium">this</strong> list (server adds them
          after ingest). Use LinkedIn search, Sales Nav lists, or connections — same capture button as usual.
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

      <section className="clin-card p-4">
        <h3 className="text-sm font-semibold">Capture queue & readiness</h3>
        <p className="mt-1 text-xs text-clin-muted">
          Set this campaign as <strong className="font-medium">capture target</strong> above, then open each LinkedIn
          profile from the links below (or use <strong className="font-medium">Open next</strong> in the extension).
          Scroll About and Experience, then <strong className="font-medium">Capture</strong>. Filter the member list by
          pipeline state. Counts below ignore people already marked <strong className="font-medium">sent</strong> or{" "}
          <strong className="font-medium">skipped</strong>.
        </p>
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
                {filterCounts.has_draft} with text
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
                No open members need a richer capture — everyone left is detailed, or the rest are sent/skipped, or the
                list is empty.
              </p>
            )}
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="text-sm font-semibold">
          Members ({members.length}
          {memberFilter !== "all" ? ` / ${membersEnriched.length} total` : ""})
        </h2>
        {membersEnriched.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {MEMBER_FILTER_CHIPS.map(({ key, label }) => (
              <Link
                key={key}
                href={memberFilterHref(id, key)}
                className={filterChipClass(memberFilter === key)}
              >
                {label} ({filterCounts[key]})
              </Link>
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
            <p className="text-sm text-clin-muted">No members match this filter.</p>
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
              } = row;
              const draft = member.draftOutreach ?? "";
              const hasDraft = draft.trim().length > 0;
              const extras = outreachExtras.get(member.id);
              return (
                <div
                  key={`${member.id}-${member.updatedAt.getTime()}`}
                  className="clin-card p-4"
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
                        {member.status}
                      </span>
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
                  {icpRationale ? (
                    <div className="mt-3 rounded-md border border-[var(--clin-border)] bg-[var(--clin-surface-muted)]/40 px-3 py-2 text-sm">
                      {icpRecommendedAction ? (
                        <p className="text-xs font-medium text-[var(--clin-text)]">
                          {ICP_ACTION_LABELS[icpRecommendedAction]}
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-[var(--clin-muted)]">{icpRationale}</p>
                    </div>
                  ) : null}
                  <form action={saveCampaignMemberDraftAction} className="mt-3 space-y-2">
                    <input type="hidden" name="campaignId" value={id} />
                    <input type="hidden" name="memberId" value={member.id} />
                    <textarea
                      name="draftOutreach"
                      rows={5}
                      defaultValue={draft}
                      className="w-full clin-input text-sm"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        className="clin-btn-secondary text-xs px-2 py-1"
                      >
                        Save draft
                      </button>
                    </div>
                  </form>
                  {extras?.messageSentAt ? (
                    <p className="mt-2 text-xs text-clin-muted">
                      Sent (recorded):{" "}
                      {extras.messageSentAt.toLocaleString(undefined, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </p>
                  ) : null}
                  {member.status === "sent" || member.status === "skipped" ? (
                    <form
                      action={updateMemberReplyOutcomeAction}
                      className="mt-2 flex flex-wrap items-end gap-2"
                    >
                      <input type="hidden" name="campaignId" value={id} />
                      <input type="hidden" name="memberId" value={member.id} />
                      <label className="text-xs">
                        <span className="font-medium text-clin-text">Reply</span>
                        <select
                          name="replyOutcome"
                          defaultValue={extras?.messageReplyOutcome ?? "unknown"}
                          className="mt-0.5 clin-select text-xs"
                        >
                          <option value="unknown">Unknown</option>
                          <option value="replied">Replied</option>
                          <option value="no_reply">No reply yet</option>
                          <option value="not_applicable">N/A</option>
                        </select>
                      </label>
                      <label className="min-w-[12rem] flex-1 text-xs">
                        <span className="font-medium text-clin-text">Note</span>
                        <input
                          name="messageOutcomeNote"
                          type="text"
                          defaultValue={extras?.messageOutcomeNote ?? ""}
                          placeholder="Optional"
                          className="mt-0.5 clin-input text-xs"
                        />
                      </label>
                      <button
                        type="submit"
                        className="clin-btn-secondary text-xs px-2 py-1"
                      >
                        Save outcome
                      </button>
                    </form>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <CampaignMemberIcpCheckButton
                      campaignId={id}
                      memberId={member.id}
                    />
                    <form action={generateOneOutreachDraftAction}>
                      <input type="hidden" name="campaignId" value={id} />
                      <input type="hidden" name="memberId" value={member.id} />
                      <button
                        type="submit"
                        className="clin-btn-secondary text-xs px-2 py-1"
                      >
                        Regenerate (LLM)
                      </button>
                    </form>
                    {member.status !== "ready" ? (
                      <form action={approveCampaignMemberReadyAction}>
                        <input type="hidden" name="campaignId" value={id} />
                        <input type="hidden" name="memberId" value={member.id} />
                        <button
                          type="submit"
                          disabled={!hasDraft}
                          className="rounded-md bg-emerald-700 px-2 py-1 text-xs text-white disabled:opacity-40"
                        >
                          Ready for extension
                        </button>
                      </form>
                    ) : (
                      <form action={reopenCampaignMemberDraftAction}>
                        <input type="hidden" name="campaignId" value={id} />
                        <input type="hidden" name="memberId" value={member.id} />
                        <button
                          type="submit"
                          className="clin-btn-secondary text-xs px-2 py-1"
                        >
                          Back to draft
                        </button>
                      </form>
                    )}
                    {member.status !== "sent" && member.status !== "skipped" ? (
                      <>
                        <form action={markCampaignMemberSentAction}>
                          <input type="hidden" name="campaignId" value={id} />
                          <input type="hidden" name="memberId" value={member.id} />
                          <button
                            type="submit"
                            className="rounded-md bg-sky-800 px-2 py-1 text-xs text-white dark:bg-sky-700"
                            title="Use after you send on LinkedIn (same as extension). Optional: save draft in Clin first for your records."
                          >
                            Mark sent (manual)
                          </button>
                        </form>
                        <form action={markCampaignMemberSkippedAction}>
                          <input type="hidden" name="campaignId" value={id} />
                          <input type="hidden" name="memberId" value={member.id} />
                          <button
                            type="submit"
                            className="clin-btn-secondary text-xs px-2 py-1"
                          >
                            Skip
                          </button>
                        </form>
                      </>
                    ) : null}
                    <RemoveFromCampaignForm campaignId={id} memberId={member.id} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
