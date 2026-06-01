"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type CampaignOption = { id: string; name: string; pendingAnalysis: number };

type CampaignResult = {
  contactId: string;
  fullName: string | null;
  ok: boolean;
  tier?: string;
  fit?: string;
  actions?: string[];
  errors?: string[];
  analyzeError?: string;
};

export function AutopilotCampaignPanel({
  campaigns,
  defaultLimit,
  draftOnReachOut,
  tagSkipAsGhost,
  tagNurtureAsWarm,
}: {
  campaigns: CampaignOption[];
  defaultLimit: number;
  draftOnReachOut: boolean;
  tagSkipAsGhost: boolean;
  tagNurtureAsWarm: boolean;
}) {
  const router = useRouter();
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [limit, setLimit] = useState(defaultLimit);
  const [mode, setMode] = useState<
    "pending_analysis" | "reanalyze_all" | "actions_only"
  >("pending_analysis");
  const [runActions, setRunActions] = useState(true);
  const [draftReach, setDraftReach] = useState(draftOnReachOut);
  const [tagGhost, setTagGhost] = useState(tagSkipAsGhost);
  const [tagWarm, setTagWarm] = useState(tagNurtureAsWarm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    campaignName: string;
    processed: number;
    succeeded: number;
  } | null>(null);
  const [results, setResults] = useState<CampaignResult[] | null>(null);

  const selected = campaigns.find((c) => c.id === campaignId);

  async function runCampaign() {
    if (!campaignId) return;
    setBusy(true);
    setError(null);
    setResults(null);
    setSummary(null);
    try {
      const res = await fetch("/api/autopilot/campaign-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          limit,
          mode,
          runActions,
          minProfileDepth: "thin",
          policy: {
            draftOnReachOut: draftReach,
            tagSkipAsGhost: tagGhost,
            tagNurtureAsWarm: tagWarm,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || `HTTP ${res.status}`);
        return;
      }
      setSummary({
        campaignName: data.campaignName,
        processed: data.processed,
        succeeded: data.succeeded,
      });
      setResults(data.results ?? []);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (campaigns.length === 0) {
    return (
      <div className="clin-card space-y-3 p-5">
        <h2 className="clin-section-title">Campaign autopilot</h2>
        <p className="clin-body">
          Create a campaign under{" "}
          <Link href="/outreach" className="clin-link">
            Outreach
          </Link>{" "}
          and add members first.
        </p>
      </div>
    );
  }

  return (
    <div className="clin-card space-y-4 p-5">
      <h2 className="clin-section-title">Campaign autopilot</h2>
      <p className="clin-body">
        For each member with at least a thin profile capture: run AI fit analysis,
        then optionally{" "}
        <strong className="clin-strong">take actions</strong> — generate an
        outreach draft for <em>reach out</em>, tag segments for skip/nurture, add
        to the campaign. Uses your goals &amp; positioning; messaging history
        improves results when captured.
      </p>

      <label className="flex max-w-md flex-col gap-1 text-sm">
        <span className="font-medium text-clin-text">Campaign</span>
        <select
          value={campaignId}
          onChange={(e) => setCampaignId(e.target.value)}
          className="clin-input"
        >
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.pendingAnalysis > 0
                ? ` (${c.pendingAnalysis} need analysis)`
                : ""}
            </option>
          ))}
        </select>
      </label>

      {selected && selected.pendingAnalysis > 0 ? (
        <p className="text-sm text-clin-muted">
          About {selected.pendingAnalysis} member
          {selected.pendingAnalysis === 1 ? "" : "s"} still need analysis in this
          campaign.
        </p>
      ) : null}

      <label className="flex max-w-xs flex-col gap-1 text-sm">
        <span className="font-medium text-clin-text">Mode</span>
        <select
          value={mode}
          onChange={(e) =>
            setMode(
              e.target.value as
                | "pending_analysis"
                | "reanalyze_all"
                | "actions_only",
            )
          }
          className="clin-input"
        >
          <option value="pending_analysis">Analyze only if missing</option>
          <option value="reanalyze_all">Re-analyze all (up to limit)</option>
          <option value="actions_only">Actions only (use existing fit)</option>
        </select>
      </label>

      <label className="flex max-w-xs flex-col gap-1 text-sm">
        <span className="font-medium text-clin-text">Members this run (max 20)</span>
        <input
          type="number"
          min={1}
          max={20}
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="clin-input"
        />
      </label>

      <fieldset className="space-y-2 text-sm">
        <legend className="font-medium text-clin-text">After analysis</legend>
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            checked={runActions}
            onChange={(e) => setRunActions(e.target.checked)}
            className="mt-1"
          />
          <span>Apply actions from fit (drafts, tags)</span>
        </label>
        {runActions ? (
          <div className="ml-6 space-y-2">
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={draftReach}
                onChange={(e) => setDraftReach(e.target.checked)}
                className="mt-1"
              />
              <span>Draft message when fit is reach out</span>
            </label>
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={tagGhost}
                onChange={(e) => setTagGhost(e.target.checked)}
                className="mt-1"
              />
              <span>Tag skip as ghost segment</span>
            </label>
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={tagWarm}
                onChange={(e) => setTagWarm(e.target.checked)}
                className="mt-1"
              />
              <span>Tag nurture as warm segment</span>
            </label>
          </div>
        ) : null}
      </fieldset>

      <button
        type="button"
        disabled={busy || !campaignId}
        onClick={() => void runCampaign()}
        className="clin-btn-primary"
      >
        {busy ? "Running…" : "Run campaign autopilot"}
      </button>

      {error ? <p className="clin-error">{error}</p> : null}
      {summary ? (
        <p className="text-sm font-medium text-clin-text">
          {summary.campaignName}: {summary.succeeded}/{summary.processed}{" "}
          succeeded
        </p>
      ) : null}
      {results && results.length > 0 ? (
        <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
          {results.map((r) => (
            <li key={r.contactId} className="border-b border-clin-border pb-2">
              <Link href={`/contacts/${r.contactId}`} className="clin-link font-medium">
                {r.fullName || r.contactId.slice(0, 8)}
              </Link>
              {r.ok ? (
                <span className="ml-2 text-emerald-700">
                  {r.fit ?? "—"}
                  {r.actions?.length ? ` · ${r.actions.join(", ")}` : ""}
                </span>
              ) : (
                <span className="ml-2 text-red-700">
                  {r.analyzeError || r.errors?.join("; ") || "failed"}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
