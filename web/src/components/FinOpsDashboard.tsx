"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { FinOpsSummary } from "@/lib/llm/llmFinOps";

function eur(n: number): string {
  if (n < 0.01 && n > 0) return `< €0.01`;
  return `€${n.toFixed(n >= 1 ? 2 : 4)}`;
}

function BreakdownTable({
  title,
  rows,
}: {
  title: string;
  rows: FinOpsSummary["byFeature"];
}) {
  if (rows.length === 0) {
    return (
      <div className="clin-card p-4">
        <h3 className="clin-section-title">{title}</h3>
        <p className="mt-2 text-sm text-[var(--clin-muted)]">No billable usage in this period.</p>
      </div>
    );
  }
  return (
    <div className="clin-card overflow-x-auto p-4">
      <h3 className="clin-section-title">{title}</h3>
      <table className="mt-3 w-full min-w-[320px] text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--clin-border)] text-[var(--clin-muted)]">
            <th className="py-2 pr-3 font-medium">Name</th>
            <th className="py-2 pr-3 font-medium">Requests</th>
            <th className="py-2 pr-3 font-medium">Tokens</th>
            <th className="py-2 font-medium">Est. cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-[var(--clin-border)]/60">
              <td className="py-2 pr-3">{r.label}</td>
              <td className="py-2 pr-3 tabular-nums">{r.requests}</td>
              <td className="py-2 pr-3 tabular-nums">{r.tokens.toLocaleString()}</td>
              <td className="py-2 tabular-nums font-medium">{eur(r.costEur)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FinOpsDashboard() {
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState<FinOpsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/finops/summary?days=${days}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setSummary(data as FinOpsSummary);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const maxDayCost = Math.max(
    ...(summary?.byDay.map((d) => d.costEur) ?? [0]),
    0.0001,
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--clin-muted)]">
            <Link href="/settings" className="clin-link">
              Settings
            </Link>
          </p>
          <h1 className="clin-page-title mt-1">AI FinOps</h1>
          <p className="clin-page-lead">
            Estimated cloud spend from your Clin instance — driven by whichever tools you
            enable (cloud LLM, Tavily, etc.). Local Ollama runs are shown for volume only.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-[var(--clin-muted)]">Period</span>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="clin-input"
            >
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void load()}
            className="clin-btn-secondary text-sm"
            disabled={loading}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {error ? <p className="clin-error">{error}</p> : null}

      {summary ? (
        <>
          <div className="clin-card p-4 text-sm">
            <h2 className="clin-section-title">Your active AI tools</h2>
            <ul className="mt-2 space-y-1 text-[var(--clin-muted)]">
              <li>
                <strong className="text-[var(--clin-text)]">Chat LLM:</strong>{" "}
                {summary.activeTools.llmProvider} · {summary.activeTools.llmModel}
                {summary.activeTools.llmBillable ? (
                  <span className="text-amber-700"> (billable)</span>
                ) : (
                  <span className="text-emerald-700"> (local — €0)</span>
                )}
              </li>
              <li>
                <strong className="text-[var(--clin-text)]">Tavily discovery:</strong>{" "}
                {summary.activeTools.tavilyConfigured
                  ? "configured (billable when used)"
                  : "not configured"}
              </li>
              <li>
                <strong className="text-[var(--clin-text)]">Post images (SD):</strong>{" "}
                {summary.activeTools.imageGenEnabled
                  ? "enabled — costs depend on your SD host (not logged here yet)"
                  : "off"}
              </li>
            </ul>
            <p className="mt-3 text-xs">
              Change tools in{" "}
              <Link href="/settings" className="clin-link">
                Settings → AI assistant
              </Link>
              . Pricing uses published EUR/1M token estimates; override Tavily with{" "}
              <code className="text-[10px]">TAVILY_EUR_PER_CREDIT</code>.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="clin-card p-4">
              <p className="text-xs font-medium uppercase text-[var(--clin-muted)]">
                Cloud est. spend
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {eur(summary.cloud.totalCostEur)}
              </p>
              <p className="mt-1 text-xs text-[var(--clin-muted)]">
                {summary.cloud.totalRequests} requests · avg{" "}
                {eur(summary.cloud.avgCostPerRequest)}/req
              </p>
            </div>
            <div className="clin-card p-4">
              <p className="text-xs font-medium uppercase text-[var(--clin-muted)]">
                Cloud tokens
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {summary.cloud.totalTokens.toLocaleString()}
              </p>
            </div>
            <div className="clin-card p-4">
              <p className="text-xs font-medium uppercase text-[var(--clin-muted)]">
                Local (Ollama)
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {summary.local.totalRequests}
              </p>
              <p className="mt-1 text-xs text-[var(--clin-muted)]">
                {summary.local.totalTokens.toLocaleString()} tokens · €0
              </p>
            </div>
            <div className="clin-card p-4">
              <p className="text-xs font-medium uppercase text-[var(--clin-muted)]">
                Failed (cloud)
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {summary.cloud.failedRequests}
              </p>
            </div>
          </div>

          {summary.byDay.length > 0 ? (
            <div className="clin-card p-4">
              <h3 className="clin-section-title">Daily cloud spend</h3>
              <div className="mt-4 flex items-end gap-1 h-32">
                {summary.byDay.map((d) => (
                  <div
                    key={d.date}
                    className="flex min-w-0 flex-1 flex-col items-center gap-1"
                    title={`${d.date}: ${eur(d.costEur)}`}
                  >
                    <div
                      className="w-full rounded-t bg-[var(--clin-accent)]/80"
                      style={{
                        height: `${Math.max(4, (d.costEur / maxDayCost) * 100)}%`,
                      }}
                    />
                    <span className="text-[9px] text-[var(--clin-muted)]">
                      {d.date.slice(5)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <BreakdownTable title="By feature" rows={summary.byFeature} />
            <BreakdownTable title="By model" rows={summary.byModel} />
          </div>

          {summary.recentBillable.length > 0 ? (
            <div className="clin-card p-4">
              <h3 className="clin-section-title">Recent billable calls</h3>
              <ul className="mt-2 space-y-1 font-mono text-xs">
                {summary.recentBillable.map((r, i) => (
                  <li key={`${r.at}-${i}`} className="text-[var(--clin-muted)]">
                    <span className={r.ok ? "text-emerald-700" : "text-red-700"}>
                      {r.ok ? "OK" : "ERR"}
                    </span>{" "}
                    {r.feature} · {r.model} · {eur(r.costEur)} ·{" "}
                    {new Date(r.at).toLocaleString()}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}

      {!loading && !summary && !error ? (
        <p className="clin-body">No data.</p>
      ) : null}
    </div>
  );
}
