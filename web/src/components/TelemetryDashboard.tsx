"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { AppEvent } from "@/lib/telemetry/appEventLog";
import type { TelemetrySummary } from "@/lib/telemetry/telemetrySummary";

function CaptureIngestDebugPanel() {
  const [items, setItems] = useState<AppEvent[]>([]);
  const [logFile, setLogFile] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(
        "/api/telemetry/events?action=capture_ingest&limit=40&errorsOnly=1",
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setItems(Array.isArray(data.items) ? data.items : []);
      setLogFile(typeof data.logFile === "string" ? data.logFile : "");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div id="capture-debug" className="clin-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="clin-section-title">Capture ingest debug</h3>
          <p className="mt-1 text-sm text-[var(--clin-muted)]">
            Failed extension profile captures (validation, ingest, pace). For all
            events, open the JSONL file on disk.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="clin-btn-secondary text-sm"
          disabled={loading}
        >
          Refresh
        </button>
      </div>
      {logFile ? (
        <p className="mt-2 break-all font-mono text-xs text-[var(--clin-muted)]">
          Log file: {logFile}
        </p>
      ) : null}
      {loadError ? <p className="clin-error mt-2">{loadError}</p> : null}
      {!loading && items.length === 0 && !loadError ? (
        <p className="mt-3 text-sm text-[var(--clin-muted)]">
          No failed capture_ingest events in the log yet.
        </p>
      ) : null}
      {items.length > 0 ? (
        <ul className="mt-3 max-h-96 space-y-2 overflow-y-auto font-mono text-xs">
          {items.map((e) => (
            <li
              key={e.id}
              className="rounded border border-[var(--clin-border)] p-2 text-[var(--clin-text)]"
            >
              <div className="text-[var(--clin-muted)]">
                {new Date(e.at).toLocaleString()} · {e.ok ? "OK" : "ERR"}
                {e.durationMs != null ? ` · ${ms(e.durationMs)}` : ""}
              </div>
              {e.error ? (
                <div className="mt-1 text-red-700">{e.error}</div>
              ) : null}
              {e.meta && Object.keys(e.meta).length > 0 ? (
                <div className="mt-1 text-[var(--clin-muted)]">
                  {Object.entries(e.meta)
                    .map(([k, v]) => `${k}=${String(v)}`)
                    .join(" · ")}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ms(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 1000) return `${n}ms`;
  return `${(n / 1000).toFixed(1)}s`;
}

function CountTable({
  title,
  rows,
  countLabel = "Count",
}: {
  title: string;
  rows: TelemetrySummary["featureUsage"];
  countLabel?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="clin-card p-4">
        <h3 className="clin-section-title">{title}</h3>
        <p className="mt-2 text-sm text-[var(--clin-muted)]">No events in this period.</p>
      </div>
    );
  }
  return (
    <div className="clin-card overflow-x-auto p-4">
      <h3 className="clin-section-title">{title}</h3>
      <table className="mt-3 w-full min-w-[320px] text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--clin-border)] text-[var(--clin-muted)]">
            <th className="py-2 pr-3 font-medium">Action</th>
            <th className="py-2 pr-3 font-medium">{countLabel}</th>
            <th className="py-2 pr-3 font-medium">Failed</th>
            <th className="py-2 font-medium">Avg time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-[var(--clin-border)]/60">
              <td className="py-2 pr-3">{r.label}</td>
              <td className="py-2 pr-3 tabular-nums">{r.count}</td>
              <td className="py-2 pr-3 tabular-nums">{r.failed}</td>
              <td className="py-2 tabular-nums">{ms(r.avgDurationMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TelemetryDashboard() {
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState<TelemetrySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/telemetry/summary?days=${days}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setSummary(data as TelemetrySummary);
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

  const totalLlm = summary?.llmByFeature.reduce((a, f) => a + f.requests, 0) ?? 0;
  const failedLlm = summary?.llmByFeature.reduce((a, f) => a + f.failed, 0) ?? 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--clin-muted)]">
            <Link href="/settings" className="clin-link">
              Settings
            </Link>
          </p>
          <h1 className="clin-page-title mt-1">Usage telemetry</h1>
          <p className="clin-page-lead">
            Local signals to learn what features and AI flows you use. Anonymously share
            with the project to help improve Clin for everyone (optional, disabled until
            you consent).
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
            <h2 className="clin-section-title">Cloud collection status</h2>
            {summary.cloud.consented && summary.cloud.cloudConfigured ? (
              <div className="mt-2">
                <p className="text-emerald-700">
                  Sharing anonymously to help improve Clin
                </p>
                <p className="mt-1 text-xs text-[var(--clin-muted)]">
                  Instance ID: <code>{summary.cloud.instanceId}</code>
                </p>
                <p className="mt-2 text-xs text-[var(--clin-muted)]">
                  To stop sharing, set{" "}
                  <code className="text-[10px]">CLIN_TELEMETRY_ENABLED=false</code> in{" "}
                  <code className="text-[10px]">web/.env.local</code> and restart.
                </p>
              </div>
            ) : summary.cloud.consented ? (
              <div className="mt-2">
                <p className="text-[var(--clin-text)]">
                  You opted in — local telemetry is active.
                </p>
                <p className="mt-1 text-sm text-[var(--clin-muted)]">
                  Anonymous cloud sync is not enabled in this build yet. Your preference
                  is saved; a future update will start sending when the project backend
                  is ready. Nothing leaves your machine until then.
                </p>
                <p className="mt-1 text-xs text-[var(--clin-muted)]">
                  Instance ID (for when sync goes live):{" "}
                  <code>{summary.cloud.instanceId}</code>
                </p>
              </div>
            ) : (
              <div className="mt-2">
                <p className="text-[var(--clin-muted)]">
                  Not sharing. You declined the consent prompt or set{" "}
                  <code className="text-xs">CLIN_TELEMETRY_ENABLED=false</code> in env.
                </p>
                <p className="mt-2 text-xs text-[var(--clin-muted)]">
                  Delete{" "}
                  <code className="text-[10px]">
                    web/data/telemetry-settings.json
                  </code>{" "}
                  to see the consent prompt again.
                </p>
              </div>
            )}
          </div>

          <div className="clin-card p-4 text-sm">
            <h2 className="clin-section-title">How to use this as an editor</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--clin-muted)]">
              <li>
                <strong className="text-[var(--clin-text)]">Feature usage</strong> — see
                which flows run (captures, autopilot, editorial). Low counts mean unused
                or broken UX.
              </li>
              <li>
                <strong className="text-[var(--clin-text)]">Orchestrations</strong> —
                multi-step jobs with avg duration and failure rate. Tune batch sizes and
                pacing here.
              </li>
              <li>
                <strong className="text-[var(--clin-text)]">LLM by feature/model</strong>{" "}
                — compare latency (p95) and errors across Ollama vs cloud models. Pair
                with{" "}
                <Link href="/settings/finops" className="clin-link">
                  FinOps
                </Link>{" "}
                for cost.
              </li>
            </ul>
            <p className="mt-3 font-mono text-xs text-[var(--clin-muted)]">
              {summary.logFiles.appEvents}
              <br />
              {summary.logFiles.llmCalls}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="clin-card p-4">
              <p className="text-xs font-medium uppercase text-[var(--clin-muted)]">
                Feature events
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {summary.featureUsage.reduce((a, r) => a + r.count, 0)}
              </p>
            </div>
            <div className="clin-card p-4">
              <p className="text-xs font-medium uppercase text-[var(--clin-muted)]">
                LLM calls (all providers)
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{totalLlm}</p>
              <p className="mt-1 text-xs text-[var(--clin-muted)]">
                {failedLlm} failed
              </p>
            </div>
            <div className="clin-card p-4">
              <p className="text-xs font-medium uppercase text-[var(--clin-muted)]">
                Orchestration runs
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {summary.orchestrations.reduce((a, r) => a + r.count, 0)}
              </p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <CountTable title="Feature usage" rows={summary.featureUsage} />
            <CountTable title="Orchestrations" rows={summary.orchestrations} />
          </div>

          {summary.llmByFeature.length > 0 ? (
            <div className="clin-card overflow-x-auto p-4">
              <h3 className="clin-section-title">LLM by feature</h3>
              <table className="mt-3 w-full min-w-[480px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--clin-border)] text-[var(--clin-muted)]">
                    <th className="py-2 pr-3 font-medium">Feature</th>
                    <th className="py-2 pr-3 font-medium">Calls</th>
                    <th className="py-2 pr-3 font-medium">Failed</th>
                    <th className="py-2 pr-3 font-medium">Avg</th>
                    <th className="py-2 font-medium">p95</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.llmByFeature.map((f) => (
                    <tr
                      key={f.feature}
                      className="border-b border-[var(--clin-border)]/60"
                    >
                      <td className="py-2 pr-3">{f.label}</td>
                      <td className="py-2 pr-3 tabular-nums">{f.requests}</td>
                      <td className="py-2 pr-3 tabular-nums">{f.failed}</td>
                      <td className="py-2 pr-3 tabular-nums">{ms(f.avgDurationMs)}</td>
                      <td className="py-2 tabular-nums">{ms(f.p95DurationMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {summary.llmByModel.length > 0 ? (
            <div className="clin-card overflow-x-auto p-4">
              <h3 className="clin-section-title">LLM by model</h3>
              <table className="mt-3 w-full min-w-[400px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--clin-border)] text-[var(--clin-muted)]">
                    <th className="py-2 pr-3 font-medium">Provider</th>
                    <th className="py-2 pr-3 font-medium">Model</th>
                    <th className="py-2 pr-3 font-medium">Calls</th>
                    <th className="py-2 pr-3 font-medium">Failed</th>
                    <th className="py-2 font-medium">Avg</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.llmByModel.map((m) => (
                    <tr
                      key={`${m.provider}:${m.model}`}
                      className="border-b border-[var(--clin-border)]/60"
                    >
                      <td className="py-2 pr-3">{m.provider}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{m.model}</td>
                      <td className="py-2 pr-3 tabular-nums">{m.requests}</td>
                      <td className="py-2 pr-3 tabular-nums">{m.failed}</td>
                      <td className="py-2 tabular-nums">{ms(m.avgDurationMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {summary.recentEvents.length > 0 ? (
            <div className="clin-card p-4">
              <h3 className="clin-section-title">Recent app events</h3>
              <ul className="mt-2 space-y-1 font-mono text-xs">
                {summary.recentEvents.map((e, i) => (
                  <li key={`${e.at}-${i}`} className="text-[var(--clin-muted)]">
                    <span className={e.ok ? "text-emerald-700" : "text-red-700"}>
                      {e.ok ? "OK" : "ERR"}
                    </span>{" "}
                    {e.kind}/{e.action} · {ms(e.durationMs)} ·{" "}
                    {new Date(e.at).toLocaleString()}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <CaptureIngestDebugPanel />
        </>
      ) : null}

      {!loading && !summary && !error ? (
        <p className="clin-body">
          No telemetry yet. Use the app (captures, autopilot, LLM features) and refresh.
        </p>
      ) : null}
    </div>
  );
}
