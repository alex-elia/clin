"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import { appendTranscriptToText } from "@/lib/speechRecognition";
import {
  CAMPAIGN_PREP_MIN_BRIEF_CHARS,
  type CampaignPlanFromBrief,
  type ContactSuggestion,
} from "@/lib/campaignPrepAutopilotShared";

type PrepResult = {
  plan: CampaignPlanFromBrief;
  appliedFields: boolean;
  suggestions: ContactSuggestion[];
  addedContactIds: string[];
  membersIcpVerified: number;
  pipeline?: {
    campaignName: string;
    results: {
      contactId: string;
      fullName: string | null;
      ok: boolean;
      fit?: string;
      actions?: string[];
    }[];
  };
};

const FIT_CLASS: Record<string, string> = {
  strong: "text-emerald-700 dark:text-emerald-300",
  partial: "text-amber-800 dark:text-amber-200",
  weak: "text-red-700 dark:text-red-300",
  unknown: "text-[var(--clin-muted)]",
};

export function CampaignAutopilotPrepPanel({
  campaignId,
  speechLanguage,
}: {
  campaignId: string;
  speechLanguage?: string | null;
}) {
  const router = useRouter();
  const [brief, setBrief] = useState("");
  const [applyFields, setApplyFields] = useState(true);
  const [suggestDb, setSuggestDb] = useState(true);
  const [verifyMembers, setVerifyMembers] = useState(true);
  const [runPipeline, setRunPipeline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PrepResult | null>(null);
  const [selectedAdds, setSelectedAdds] = useState<Set<string>>(new Set());

  const canRun = brief.trim().length >= CAMPAIGN_PREP_MIN_BRIEF_CHARS && !busy;

  const run = useCallback(async () => {
    if (!canRun) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/prep-autopilot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: brief.trim(),
          applyFields,
          suggestFromDatabase: suggestDb,
          addContactIds: [...selectedAdds],
          verifyMembers,
          runPipeline,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        return;
      }
      setResult(data as PrepResult);
      const strong = (data.suggestions as ContactSuggestion[] | undefined)
        ?.filter((s) => s.fit === "strong")
        .map((s) => s.contactId);
      setSelectedAdds(new Set(strong ?? []));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }, [brief, canRun, campaignId, applyFields, suggestDb, verifyMembers, runPipeline, router]);

  const runWithAdds = useCallback(async () => {
    if (!canRun) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/prep-autopilot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief:
            brief.trim() ||
            "Add selected contacts to this campaign (no field changes).",
          applyFields: false,
          suggestFromDatabase: false,
          addContactIds: [...selectedAdds],
          verifyMembers: false,
          runPipeline: false,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        return;
      }
      setResult((prev) =>
        prev
          ? {
              ...prev,
              addedContactIds: [
                ...new Set([
                  ...prev.addedContactIds,
                  ...(data.addedContactIds as string[]),
                ]),
              ],
            }
          : (data as PrepResult),
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }, [brief, canRun, campaignId, selectedAdds, router]);

  return (
    <section className="clin-card border-2 border-[var(--clin-accent)]/25 p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--clin-accent)]">
        Autopilot
      </p>
      <h2 className="clin-section-title mt-0.5">Prepare this campaign</h2>
      <p className="mt-1 text-sm text-[var(--clin-muted)]">
        Describe who you want to reach and what you offer — mic or a few lines.
        Clin drafts the campaign ICP and context, suggests contacts from your
        database, and checks existing members for fit.
      </p>

      <div className="mt-4 rounded-xl border border-[var(--clin-border)] bg-[var(--clin-surface)] p-3">
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={4}
          disabled={busy}
          placeholder="e.g. Fractional CTOs at B2B SaaS in France — offer AI readiness audit, warm tone, 2-week pilot…"
          className="clin-input min-h-[5rem] w-full resize-y border-0 bg-transparent shadow-none focus:ring-0"
        />
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2 border-t border-[var(--clin-border)] pt-2">
          <VoiceInputButton
            language={speechLanguage ?? undefined}
            disabled={busy}
            onAppend={(text) =>
              setBrief((prev) => appendTranscriptToText(prev, text))
            }
          />
          <button
            type="button"
            className="clin-btn-primary"
            disabled={!canRun}
            onClick={() => void run()}
          >
            {busy ? "Running…" : "Run prep autopilot"}
          </button>
        </div>
      </div>

      <fieldset className="mt-4 space-y-2 text-sm">
        <legend className="font-medium text-[var(--clin-text)]">Include</legend>
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            checked={applyFields}
            onChange={(e) => setApplyFields(e.target.checked)}
            className="mt-1"
          />
          <span>Apply generated name, context, ICP, and writer notes to this campaign</span>
        </label>
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            checked={suggestDb}
            onChange={(e) => setSuggestDb(e.target.checked)}
            className="mt-1"
          />
          <span>Suggest contacts to add from your Clin database</span>
        </label>
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            checked={verifyMembers}
            onChange={(e) => setVerifyMembers(e.target.checked)}
            className="mt-1"
          />
          <span>
            Run ICP check on members (saved on each row — filter in the member list)
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            checked={runPipeline}
            onChange={(e) => setRunPipeline(e.target.checked)}
            className="mt-1"
          />
          <span>
            After prep, run analyze + draft for members who need it (slower)
          </span>
        </label>
      </fieldset>

      {error ? (
        <p className="mt-3 text-sm text-red-700 dark:text-red-300">{error}</p>
      ) : null}

      {result ? (
        <div className="mt-6 space-y-6 border-t border-[var(--clin-border)] pt-6">
          <div>
            <h3 className="text-sm font-semibold">Campaign draft</h3>
            {result.appliedFields ? (
              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                Saved to campaign — review fields below.
              </p>
            ) : (
              <p className="text-xs text-[var(--clin-muted)]">
                Preview only — enable “Apply” on next run to save.
              </p>
            )}
            <dl className="mt-2 space-y-2 text-sm">
              <div>
                <dt className="text-xs font-medium uppercase text-[var(--clin-muted)]">
                  ICP
                </dt>
                <dd className="mt-0.5 whitespace-pre-wrap">{result.plan.icpText}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-[var(--clin-muted)]">
                  Context (excerpt)
                </dt>
                <dd className="mt-0.5 line-clamp-4 whitespace-pre-wrap">
                  {result.plan.contextText}
                </dd>
              </div>
            </dl>
          </div>

          {result.suggestions.length > 0 ? (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Suggested contacts</h3>
                {selectedAdds.size > 0 ? (
                  <button
                    type="button"
                    className="clin-btn-secondary text-xs"
                    disabled={busy}
                    onClick={() => void runWithAdds()}
                  >
                    Add selected ({selectedAdds.size})
                  </button>
                ) : null}
              </div>
              <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
                {result.suggestions.map((s) => (
                  <li
                    key={s.contactId}
                    className="flex gap-2 rounded-lg border border-[var(--clin-border)] p-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedAdds.has(s.contactId)}
                      onChange={(e) => {
                        setSelectedAdds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(s.contactId);
                          else next.delete(s.contactId);
                          return next;
                        });
                      }}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/contacts/${s.contactId}`}
                        className="font-medium text-[var(--clin-accent)] hover:underline"
                      >
                        {s.fullName ?? s.contactId.slice(0, 8)}
                      </Link>
                      <p className="text-xs text-[var(--clin-muted)]">
                        {s.headline}
                        {s.company ? ` · ${s.company}` : ""}
                      </p>
                      <p className={`mt-1 text-xs font-medium ${FIT_CLASS[s.fit]}`}>
                        {s.fit} — {s.rationale}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {result.membersIcpVerified > 0 ? (
            <p className="text-sm text-emerald-800 dark:text-emerald-200">
              ICP checked for {result.membersIcpVerified} member
              {result.membersIcpVerified === 1 ? "" : "s"} — use the ICP filters on
              the member list below.
            </p>
          ) : null}

          {result.pipeline?.results.length ? (
            <div>
              <h3 className="text-sm font-semibold">Pipeline run</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {result.pipeline.results.map((r) => (
                  <li key={r.contactId}>
                    <Link href={`/contacts/${r.contactId}`} className="clin-link">
                      {r.fullName ?? r.contactId.slice(0, 8)}
                    </Link>
                    {r.ok ? (
                      <span className="ml-2 text-[var(--clin-muted)]">
                        {r.fit}
                        {r.actions?.length ? ` · ${r.actions.join(", ")}` : ""}
                      </span>
                    ) : (
                      <span className="ml-2 text-red-600">failed</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
