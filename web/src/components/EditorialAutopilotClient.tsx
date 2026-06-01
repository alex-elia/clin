"use client";

import {
  saveEditorialAutopilotAction,
  enableSourcePackAction,
  enqueueTrendsRefreshAction,
  enqueueSourcesRefreshAction,
} from "@/app/actions";
import type { EditorialAutopilotPolicyJson } from "@/db/schema";

export type EditorialAutopilotClientProps = {
  brand: {
    marketRegion: string | null;
    planningHorizonDays: number | null;
    editorialAutopilotEnabled: boolean | null;
    editorialAutopilotPolicy: EditorialAutopilotPolicyJson | null;
  };
  sourceCount: number;
  tavilyConfigured: boolean;
  jobs: { id: string; type: string; status: string; lastError: string | null }[];
};

export function EditorialAutopilotClient({
  brand,
  sourceCount,
  tavilyConfigured,
  jobs,
}: EditorialAutopilotClientProps) {
  const policy = brand.editorialAutopilotPolicy ?? {};
  const trendQueries = (policy.trendQueries ?? []).join("\n");

  return (
    <section className="space-y-5">
      <div className="max-w-3xl">
        <h2 className="clin-section-title">Editorial autopilot</h2>
        <p className="mt-1 text-sm text-[var(--clin-muted)]">
          Job queue for source ingest, trend refresh, and drafting due posts. Run{" "}
          <code className="text-xs">npm run branding:tick</code> locally or schedule
          it 1–2×/day. Publishing stays manual on LinkedIn.
        </p>
      </div>

      <form action={saveEditorialAutopilotAction} className="clin-card space-y-4 p-6">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="editorialAutopilotEnabled"
            defaultChecked={Boolean(brand.editorialAutopilotEnabled)}
          />
          Enable editorial autopilot (draft due posts on tick)
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium">Market region</span>
            <select
              name="marketRegion"
              defaultValue={brand.marketRegion ?? "fr"}
              className="mt-1 w-full rounded border border-[var(--clin-border)] bg-[var(--clin-bg)] px-2 py-1.5"
            >
              <option value="fr">France (fr-b2b)</option>
              <option value="eu">EU (eu-b2b)</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium">Planning horizon (days)</span>
            <select
              name="planningHorizonDays"
              defaultValue={String(brand.planningHorizonDays ?? 14)}
              className="mt-1 w-full rounded border border-[var(--clin-border)] bg-[var(--clin-bg)] px-2 py-1.5"
            >
              <option value="7">7</option>
              <option value="14">14</option>
              <option value="30">30</option>
            </select>
          </label>
        </div>

        <label className="block text-sm">
          <span className="font-medium">Trend queries (one per line)</span>
          <textarea
            name="trendQueries"
            rows={3}
            defaultValue={trendQueries}
            placeholder={"IA entreprise France\nFinOps cloud\nsouveraineté numérique"}
            className="mt-1 w-full rounded border border-[var(--clin-border)] bg-[var(--clin-bg)] px-2 py-1.5 font-mono text-xs"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="runDraftWhenDue"
              defaultChecked={policy.runDraftWhenDue !== false}
            />
            Draft posts scheduled today
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="includeImage"
              defaultChecked={Boolean(policy.includeImage)}
            />
            Include image generation in draft jobs
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="autoMarkReady"
              defaultChecked={Boolean(policy.autoMarkReady)}
            />
            Auto mark ready (skip review)
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              name="useUnicodeEmphasis"
              defaultChecked={policy.useUnicodeEmphasis !== false}
            />
            Unicode bold/italic on copy (** and * markers, Typegrow-style)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="tavilyDiscoveryEnabled"
              defaultChecked={Boolean(policy.tavilyDiscoveryEnabled)}
              disabled={!tavilyConfigured}
            />
            Tavily discovery{tavilyConfigured ? "" : " (set TAVILY_API_KEY)"}
          </label>
        </div>

        <label className="block text-sm">
          <span className="font-medium">Max posts per tick</span>
          <input
            type="number"
            name="maxPostsPerRun"
            min={1}
            max={10}
            defaultValue={policy.maxPostsPerRun ?? 3}
            className="mt-1 w-24 rounded border border-[var(--clin-border)] bg-[var(--clin-bg)] px-2 py-1"
          />
        </label>

        <button type="submit" className="clin-btn-primary">
          Save editorial settings
        </button>
      </form>

      <div className="clin-card space-y-3 p-6">
        <h3 className="text-sm font-semibold">Sources &amp; trends</h3>
        <p className="text-sm text-[var(--clin-muted)]">
          {sourceCount} source(s) configured. Enable the FR B2B AI RSS pack for
          free trend headlines, then run{" "}
          <code className="text-xs">npm run branding:tick</code> or Refresh trends.
        </p>
        <div className="flex flex-wrap gap-2">
          <form action={enableSourcePackAction}>
            <input type="hidden" name="packId" value="fr-b2b-ai-rss" />
            <button type="submit" className="clin-btn-secondary text-sm">
              Enable FR B2B AI RSS pack
            </button>
          </form>
          <form action={enqueueTrendsRefreshAction}>
            <button type="submit" className="clin-btn-secondary text-sm">
              Refresh trends now
            </button>
          </form>
          <form action={enqueueSourcesRefreshAction}>
            <button type="submit" className="clin-btn-secondary text-sm">
              Refresh sources now
            </button>
          </form>
        </div>
      </div>

      <div className="clin-card p-6">
        <h3 className="text-sm font-semibold">Recent jobs</h3>
        {jobs.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--clin-muted)]">No jobs yet.</p>
        ) : (
          <ul className="mt-2 space-y-1 font-mono text-xs">
            {jobs.map((j) => (
              <li key={j.id}>
                {j.type} · {j.status}
                {j.lastError ? ` · ${j.lastError.slice(0, 60)}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
