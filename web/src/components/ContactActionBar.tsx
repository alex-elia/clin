"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  addContactToCampaignFromContactAction,
  setContactSegmentOverrideAction,
} from "@/app/actions";
import type { ContactCampaignMembership } from "@/lib/outreachCampaigns";

type CampaignOption = { id: string; name: string };

type Props = {
  contactId: string;
  linkedinUrl: string | null;
  campaigns: CampaignOption[];
  memberships: ContactCampaignMembership[];
};

export function ContactActionBar({
  contactId,
  linkedinUrl,
  campaigns,
  memberships: initialMemberships,
}: Props) {
  const router = useRouter();
  const [campaignId, setCampaignId] = useState(
    campaigns[0]?.id ?? "",
  );
  const [memberships, setMemberships] = useState(initialMemberships);
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeDraft, setActiveDraft] = useState<string | null>(
    initialMemberships.find((m) => m.draftOutreach?.trim())?.draftOutreach ??
      null,
  );

  async function generateDraft() {
    if (!campaignId) {
      setDraftError("Pick a campaign first.");
      return;
    }
    setDraftBusy(true);
    setDraftError(null);
    try {
      const res = await fetch(`/api/contacts/${contactId}/outreach-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDraftError(data?.error || `HTTP ${res.status}`);
        return;
      }
      setActiveDraft(data.draft || "");
      const existing = memberships.find((m) => m.campaignId === data.campaignId);
      if (existing) {
        setMemberships(
          memberships.map((m) =>
            m.campaignId === data.campaignId
              ? { ...m, draftOutreach: data.draft, memberId: data.memberId }
              : m,
          ),
        );
      } else {
        setMemberships([
          {
            memberId: data.memberId,
            campaignId: data.campaignId,
            campaignName: data.campaignName ?? "Campaign",
            status: "draft",
            draftOutreach: data.draft,
          },
          ...memberships,
        ]);
      }
      router.refresh();
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : String(e));
    } finally {
      setDraftBusy(false);
    }
  }

  async function copyDraft() {
    const text = activeDraft?.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setDraftError("Could not copy — select the draft text manually.");
    }
  }

  return (
    <section className="clin-card space-y-4 p-5">
      <h2 className="clin-section-title">What to do next</h2>
      <p className="text-sm text-clin-muted">
        Add to a campaign, generate a LinkedIn message with AI, then paste and send on
        LinkedIn yourself.
      </p>

      <div className="flex flex-wrap gap-2">
        {linkedinUrl ? (
          <a
            href={linkedinUrl}
            target="_blank"
            rel="noreferrer"
            className="clin-btn-secondary text-sm"
          >
            Open LinkedIn
          </a>
        ) : null}
        <Link href="/branding/posts/new" className="clin-btn-secondary text-sm">
          New post (mention)
        </Link>
        <Link href="/campaigns" className="clin-btn-secondary text-sm">
          All campaigns
        </Link>
      </div>

      {campaigns.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-lg border border-clin-border bg-clin-surface-muted p-4 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="min-w-[12rem] flex-1 space-y-1 text-sm">
            <span className="font-medium text-clin-text">Campaign</span>
            <select
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              className="clin-input w-full"
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <form action={addContactToCampaignFromContactAction} className="flex shrink-0">
            <input type="hidden" name="contactId" value={contactId} />
            <input type="hidden" name="campaignId" value={campaignId} />
            <button
              type="submit"
              className="clin-btn-secondary text-sm"
              disabled={!campaignId}
            >
              Add to campaign
            </button>
          </form>
          <button
            type="button"
            disabled={draftBusy || !campaignId}
            onClick={() => void generateDraft()}
            className="clin-btn-primary text-sm disabled:opacity-50"
          >
            {draftBusy ? "Writing draft…" : "Write message (AI)"}
          </button>
        </div>
      ) : (
        <p className="text-sm text-clin-muted">
          <Link href="/campaigns/new" className="clin-link">
            Create a campaign
          </Link>{" "}
          to store drafts and track outreach.
        </p>
      )}

      {draftError ? (
        <p className="text-sm text-red-600 dark:text-red-400">{draftError}</p>
      ) : null}

      {activeDraft ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-clin-muted">
              Draft message
            </span>
            <button
              type="button"
              onClick={() => void copyDraft()}
              className="clin-btn-secondary px-2 py-1 text-xs"
            >
              {copied ? "Copied" : "Copy for LinkedIn"}
            </button>
          </div>
          <textarea
            readOnly
            value={activeDraft}
            rows={8}
            className="clin-input w-full text-sm leading-relaxed"
          />
        </div>
      ) : null}

      {memberships.length > 0 ? (
        <ul className="space-y-2 text-sm">
          {memberships.map((m) => (
            <li
              key={m.memberId}
              className="flex flex-wrap items-center gap-2 rounded-md border border-clin-border px-3 py-2"
            >
              <Link
                href={`/campaigns/${m.campaignId}`}
                className="clin-link font-medium"
              >
                {m.campaignName}
              </Link>
              <span className="clin-pill text-xs">{m.status}</span>
              {m.draftOutreach?.trim() ? (
                <button
                  type="button"
                  className="clin-link text-xs"
                  onClick={() => setActiveDraft(m.draftOutreach)}
                >
                  Show draft
                </button>
              ) : (
                <span className="text-xs text-clin-muted">No draft yet</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2 border-t border-clin-border pt-4">
        <form action={setContactSegmentOverrideAction}>
          <input type="hidden" name="contactId" value={contactId} />
          <input type="hidden" name="segment" value="warm" />
          <button type="submit" className="clin-btn-secondary text-xs px-3 py-1.5">
            Tag: warm
          </button>
        </form>
        <form action={setContactSegmentOverrideAction}>
          <input type="hidden" name="contactId" value={contactId} />
          <input type="hidden" name="segment" value="remove_candidate" />
          <button
            type="submit"
            className="rounded-md border border-amber-800/40 bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-950 dark:border-amber-700 dark:bg-amber-950/80 dark:text-amber-100"
          >
            Tag: review removal
          </button>
        </form>
      </div>
    </section>
  );
}
