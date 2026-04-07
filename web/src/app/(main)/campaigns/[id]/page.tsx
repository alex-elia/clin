import Link from "next/link";
import { notFound } from "next/navigation";
import { RemoveFromCampaignForm } from "@/components/RemoveFromCampaignForm";
import {
  addContactIdsToCampaignAction,
  addSegmentToCampaignAction,
  approveCampaignMemberReadyAction,
  clearActiveExtensionCampaignAction,
  clearCaptureTargetCampaignAction,
  generateOneOutreachDraftAction,
  generateOutreachBatchAction,
  markCampaignMemberSentAction,
  markCampaignMemberSkippedAction,
  reopenCampaignMemberDraftAction,
  saveCampaignMemberDraftAction,
  setActiveExtensionCampaignAction,
  setCaptureTargetAndActiveExtensionAction,
  setCaptureTargetCampaignAction,
  updateCampaignAction,
} from "@/app/actions";
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
    ? "rounded-full border border-zinc-900 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
    : "rounded-full border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800";
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
];

const SEGMENTS = [
  "active",
  "warm",
  "dormant",
  "ghost",
  "remove_candidate",
] as const;

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
  const memberFilter = parseMemberReadinessFilter(sp.memberFilter);
  const filterCounts = readinessFilterCounts(membersEnriched);
  const members = membersEnriched.filter((m) =>
    enrichedMemberMatchesFilter(m, memberFilter),
  );
  const nextCapture = pickNextProfileCaptureTarget(membersEnriched);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/campaigns"
          className="text-sm text-zinc-600 underline dark:text-zinc-400"
        >
          ← Campaigns
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{campaign.name}</h1>
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
          <p className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
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

      <section className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Practical flow</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
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
            Optional: paste Clin contact IDs, or use <strong className="font-medium">Generate draft</strong> in the
            extension on an open profile (Ollama), or batch-generate on this page.
          </li>
          <li>
            Edit drafts, then <strong className="font-medium">Ready for extension</strong> and set{" "}
            <strong className="font-medium">active for extension</strong> so the Outreach tab can list them. Chrome is
            not push-notified; the extension <strong className="font-medium">fetches</strong> from your local API when you
            open or refresh it.
          </li>
          <li>
            After you send on LinkedIn yourself, click <strong className="font-medium">Mark sent (manual)</strong> on the
            member row below (or the same button in the extension Outreach tab). Use <strong className="font-medium">Skip</strong>{" "}
            if you will not message them.
          </li>
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Campaign details</h2>
        <form action={updateCampaignAction} className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <input type="hidden" name="campaignId" value={id} />
          <label className="block">
            <span className="text-xs font-medium uppercase text-zinc-500">Name</span>
            <input
              name="name"
              defaultValue={campaign.name}
              required
              className="mt-1 w-full max-w-md rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium uppercase text-zinc-500">Context</span>
            <textarea
              name="contextText"
              defaultValue={campaign.contextText}
              required
              rows={6}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium uppercase text-zinc-500">
              Writer instructions (for AI)
            </span>
            <textarea
              name="writerInstructions"
              defaultValue={campaign.writerInstructions ?? ""}
              rows={5}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              placeholder="Tone, must-say, avoid, length, CTA… Merged into each draft request."
            />
          </label>
          <details className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
            <summary className="cursor-pointer text-sm font-medium">
              Advanced: custom system prompt
            </summary>
            <textarea
              name="systemPromptOverride"
              defaultValue={campaign.systemPromptOverride ?? ""}
              rows={6}
              className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
              placeholder={
                'Empty = default. Must still require JSON {"message":"..."} only.'
              }
            />
          </details>
          <p className="text-xs text-zinc-500">
            Ollama:{" "}
            <Link href="/settings" className="underline">
              Settings
            </Link>
            . Dev server logs:{" "}
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">[clin:outreach-draft]</code>
          </p>
          <button
            type="submit"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium dark:border-zinc-600 dark:bg-zinc-900"
          >
            Save
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-sky-200 bg-sky-50/60 p-4 dark:border-sky-900 dark:bg-sky-950/30">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Extension: capture LinkedIn into this campaign
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
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
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600"
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

      <section className="flex flex-wrap gap-3">
        <form action={setActiveExtensionCampaignAction}>
          <input type="hidden" name="campaignId" value={id} />
          <button
            type="submit"
            disabled={isActive}
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Set active for extension only
          </button>
        </form>
        {isActive ? (
          <form action={clearActiveExtensionCampaignAction}>
            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600"
            >
              Clear active outreach campaign
            </button>
          </form>
        ) : null}
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <details className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <summary className="cursor-pointer text-sm font-semibold">
            Optional: bulk add by segment
          </summary>
          <p className="mt-2 text-xs text-zinc-500">
            Pulls up to N recently updated contacts already in Clin (not from LinkedIn live search).
          </p>
          <form action={addSegmentToCampaignAction} className="mt-3 space-y-2">
            <input type="hidden" name="campaignId" value={id} />
            <select
              name="segment"
              required
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              {SEGMENTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-zinc-500">Max</span>
              <input
                type="number"
                name="limit"
                min={1}
                max={100}
                defaultValue={30}
                className="w-24 rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
            >
              Add by segment
            </button>
          </form>
        </details>
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h3 className="text-sm font-semibold">Add by contact IDs</h3>
          <p className="mt-1 text-xs text-zinc-500">
            One UUID per line or comma-separated (from <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">/contacts/…</code>).
          </p>
          <form action={addContactIdsToCampaignAction} className="mt-3 space-y-2">
            <input type="hidden" name="campaignId" value={id} />
            <textarea
              name="contactIds"
              rows={4}
              placeholder="uuid…"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
            />
            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
            >
              Add IDs
            </button>
          </form>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h3 className="text-sm font-semibold">Batch generate (Ollama)</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Fills empty drafts for up to N members in <strong className="font-medium">draft</strong> status. By default
          only people with a <strong className="font-medium">detailed profile capture</strong> (About or Experience on
          their last profile Capture) are included.
        </p>
        <form action={generateOutreachBatchAction} className="mt-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="campaignId" value={id} />
            <label className="text-sm">
              <span className="text-zinc-500">Count</span>
              <input
                type="number"
                name="limit"
                min={1}
                max={12}
                defaultValue={6}
                className="ml-2 w-20 rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Generate batch
            </button>
          </div>
          <label className="flex max-w-xl cursor-pointer items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            <input
              type="checkbox"
              name="allowWeakProfile"
              value="1"
              className="mt-0.5"
            />
            <span>
              Allow weak profile (include people with headline-only or missing profile capture — drafts will be less
              specific).
            </span>
          </label>
        </form>
      </section>

      <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h3 className="text-sm font-semibold">Capture queue & readiness</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Set this campaign as <strong className="font-medium">capture target</strong> above, then open each LinkedIn
          profile from the links below (or use <strong className="font-medium">Open next</strong> in the extension).
          Scroll About and Experience, then <strong className="font-medium">Capture</strong>. Filter the member list by
          pipeline state. Counts below ignore people already marked <strong className="font-medium">sent</strong> or{" "}
          <strong className="font-medium">skipped</strong>.
        </p>
        {membersEnriched.length > 0 ? (
          <div className="mt-3 space-y-2 text-xs text-zinc-600 dark:text-zinc-400">
            <p>
              Profiles:{" "}
              <strong className="text-zinc-900 dark:text-zinc-100">
                {filterCounts.need_profile} missing
              </strong>
              ,{" "}
              <strong className="text-zinc-900 dark:text-zinc-100">
                {filterCounts.thin_profile} thin
              </strong>
              ,{" "}
              <strong className="text-zinc-900 dark:text-zinc-100">
                {filterCounts.profile_ok} detailed
              </strong>
              . Drafts:{" "}
              <strong className="text-zinc-900 dark:text-zinc-100">
                {filterCounts.need_draft} empty
              </strong>
              ,{" "}
              <strong className="text-zinc-900 dark:text-zinc-100">
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
                  className="font-medium text-sky-700 underline dark:text-sky-400"
                >
                  Open next profile to capture
                </a>
                {nextCapture.fullName ? (
                  <span className="text-zinc-500"> — {nextCapture.fullName}</span>
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
        <p className="mt-1 text-xs text-zinc-500">
          <strong className="font-medium text-zinc-600 dark:text-zinc-400">Remove from campaign</strong> deletes only
          this list row; the person stays in{" "}
          <Link href="/contacts" className="underline">
            Contacts
          </Link>
          .
        </p>
        <div className="mt-3 space-y-6">
          {membersEnriched.length === 0 ? (
            <p className="text-sm text-zinc-500">No contacts in this campaign yet.</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-zinc-500">No members match this filter.</p>
          ) : (
            members.map(({ member, contact, profileDepth, lastProfileCapturedAt }) => {
              const draft = member.draftOutreach ?? "";
              const hasDraft = draft.trim().length > 0;
              return (
                <div
                  key={`${member.id}-${member.updatedAt.getTime()}`}
                  className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/contacts/${contact.id}`}
                        className="font-medium hover:underline"
                      >
                        {contact.fullName || contact.id}
                      </Link>
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
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
                    </div>
                    <div className="flex min-w-0 flex-col items-end gap-1 text-right">
                      <p className="max-w-md truncate text-xs text-zinc-500">
                        {contact.headline}
                      </p>
                      {contact.linkedinUrlCanonical ? (
                        <a
                          href={contact.linkedinUrlCanonical}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-sky-700 underline dark:text-sky-400"
                        >
                          Open LinkedIn
                        </a>
                      ) : null}
                      {lastProfileCapturedAt ? (
                        <span className="text-[11px] text-zinc-400">
                          Last profile capture:{" "}
                          {lastProfileCapturedAt.toLocaleString(undefined, {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <form action={saveCampaignMemberDraftAction} className="mt-3 space-y-2">
                    <input type="hidden" name="campaignId" value={id} />
                    <input type="hidden" name="memberId" value={member.id} />
                    <textarea
                      name="draftOutreach"
                      rows={5}
                      defaultValue={draft}
                      className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600"
                      >
                        Save draft
                      </button>
                    </div>
                  </form>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <form action={generateOneOutreachDraftAction}>
                      <input type="hidden" name="campaignId" value={id} />
                      <input type="hidden" name="memberId" value={member.id} />
                      <button
                        type="submit"
                        className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600"
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
                          className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600"
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
                            className="rounded-md border border-zinc-400 px-2 py-1 text-xs text-zinc-700 dark:border-zinc-500 dark:text-zinc-300"
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
