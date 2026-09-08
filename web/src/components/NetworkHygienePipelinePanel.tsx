"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ClinChartFrame } from "@/components/charts/ClinChartFrame";
import type {
  NetworkHygieneSnapshot,
} from "@/lib/networkHygieneTypes";
import {
  runAnalyzeBatchChunked,
  type AnalyzeBatchProgress,
} from "@/lib/runAnalyzeBatchClient";

const SEGMENT_COLORS: Record<string, string> = {
  active: "#16a34a",
  warm: "#4fc3a1",
  dormant: "#ca8a04",
  ghost: "#71717a",
  remove_candidate: "#dc2626",
};

const ACTIVITY_COLORS: Record<string, string> = {
  active: "#16a34a",
  occasional: "#4fc3a1",
  lurker: "#ca8a04",
  dormant: "#71717a",
  unknown: "#d4d4d8",
};

type BatchResult =
  | { contactId: string; ok: true }
  | { contactId: string; ok: false; error: string };

function pct(n: number, total: number): number {
  if (!total) return 0;
  return Math.round((n / total) * 100);
}

function recordToBars(
  record: Record<string, number>,
  colorMap?: Record<string, string>,
) {
  return Object.entries(record)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({
      name,
      value,
      fill: colorMap?.[name] ?? "#52525b",
    }))
    .sort((a, b) => b.value - a.value);
}

export function NetworkHygienePipelinePanel() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<NetworkHygieneSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [analyzeProgress, setAnalyzeProgress] =
    useState<AnalyzeBatchProgress | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const url = refresh
        ? "/api/cleaning/network-hygiene?refresh=1"
        : "/api/cleaning/network-hygiene";
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || `HTTP ${res.status}`);
        return;
      }
      setSnapshot(data as NetworkHygieneSnapshot);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  async function runAnalyzeBatch() {
    if (!snapshot) return;
    const eligible = snapshot.metrics.pendingLlmAnalysis;
    const target = Math.min(30, eligible);
    if (target <= 0) {
      setActionError(
        snapshot.actHints.analyzeGapCount > 0
          ? `${snapshot.actHints.analyzeGapCount} profile capture(s) lack analyzable name/headline. Re-capture profiles or wait for backfill, then Rescan.`
          : "No contacts pending LLM analysis.",
      );
      return;
    }
    setBusyAction("analyze");
    setActionError(null);
    setActionSuccess(null);
    setAnalyzeProgress({ target, processed: 0, succeeded: 0, failed: 0 });
    try {
      const summary = await runAnalyzeBatchChunked({
        totalLimit: target,
        chunkSize: 1,
        onProgress: setAnalyzeProgress,
      });
      setActionSuccess(
        `Analyzed ${summary.succeeded} contact(s)${summary.failed ? ` (${summary.failed} failed)` : ""}. Refreshing metrics…`,
      );
      await load(true);
      router.refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyAction(null);
      setAnalyzeProgress(null);
    }
  }

  async function queueRemovals(includeMaybe: boolean) {
    if (!snapshot) return;
    const ids = snapshot.rows
      .filter((r) => {
        if (!r.canDisconnect) return false;
        if (r.removeVerdict === "yes" && r.bucket === "review_remove") {
          return true;
        }
        return includeMaybe && r.removeVerdict === "maybe";
      })
      .map((r) => r.contactId)
      .slice(0, 50);
    if (ids.length === 0) return;
    setBusyAction(includeMaybe ? "queue-maybe" : "queue-yes");
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch("/api/cleaning/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: ids, action: "approve_removal" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(data?.error || `HTTP ${res.status}`);
        return;
      }
      const results = (data.results ?? []) as BatchResult[];
      const ok = results.filter((r) => r.ok).length;
      const failed = results.length - ok;
      setActionSuccess(
        `Queued ${ok} removal(s)${failed ? ` (${failed} failed)` : ""}.`,
      );
      await load(true);
      router.refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyAction(null);
    }
  }

  if (loading && !snapshot) {
    return (
      <section className="clin-card p-5">
        <p className="text-sm text-[var(--clin-muted)]">
          Loading network hygiene pipeline…
        </p>
      </section>
    );
  }

  if (error && !snapshot) {
    return (
      <section className="clin-card space-y-3 p-5">
        <h2 className="clin-section-title">Network hygiene pipeline</h2>
        <p className="clin-error">{error}</p>
        <button
          type="button"
          className="clin-btn-primary text-sm"
          onClick={() => void load(true)}
        >
          Retry
        </button>
      </section>
    );
  }

  if (!snapshot) return null;

  const m = snapshot.metrics;
  const scope = Math.max(m.inPipelineScope, 1);
  const lowConfidencePct = pct(m.adviceConfidenceLow, scope);
  const showLowConfidenceWarning = lowConfidencePct > 30;
  const degreeChart = recordToBars(m.byConnectionDegree);
  const segmentChart = recordToBars(m.bySegment, SEGMENT_COLORS);
  const activityChart = recordToBars(m.byActivityTier, ACTIVITY_COLORS);
  const threadChart = recordToBars(m.byThreadStage);
  const verdictChart = recordToBars(m.byRemoveVerdict);
  const analyzeEligible = m.pendingLlmAnalysis;
  const analyzeGap = snapshot.actHints.analyzeGapCount;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="clin-section-title">Network hygiene pipeline</h2>
          <p className="mt-1 text-sm text-[var(--clin-muted)]">
            Gather → metrics → advise → act. Numbers come from your SQLite
            captures only.
          </p>
          <p className="mt-1 text-xs text-[var(--clin-muted)]">
            Last scan: {new Date(snapshot.runAt).toLocaleString()} ·{" "}
            {m.inPipelineScope} in scope (captured + known degree)
          </p>
        </div>
        <button
          type="button"
          disabled={refreshing}
          onClick={() => void load(true)}
          className="clin-btn-secondary text-sm"
        >
          {refreshing ? "Scanning…" : "Rescan"}
        </button>
      </div>

      {showLowConfidenceWarning ? (
        <div className="clin-callout border-amber-200 bg-amber-50 text-amber-950">
          <p className="text-sm">
            {lowConfidencePct}% of in-scope contacts have{" "}
            <strong className="clin-strong">low advice confidence</strong>{" "}
            (list-only or missing LLM). Removal counts are provisional — enrich
            or run batch analyze first.
          </p>
        </div>
      ) : null}

      <details className="clin-card group" open>
        <summary className="cursor-pointer list-none p-5 font-medium text-[var(--clin-text)] marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="clin-section-title">1. Coverage</span>
          <p className="mt-1 text-sm font-normal text-[var(--clin-muted)]">
            Can we advise honestly? Source: capture_sessions + contact columns.
          </p>
        </summary>
        <div className="space-y-4 border-t border-[var(--clin-border)] px-5 pb-5 pt-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <CoverageBar
              label="Analyzed (LLM)"
              value={m.withLlmAnalysis}
              total={scope}
            />
            <CoverageBar
              label="Posts capture"
              value={m.withPostsCapture}
              total={scope}
            />
            <CoverageBar
              label="Messaging capture"
              value={m.withMessagingCapture}
              total={scope}
              note={
                m.withMessagingCapture === 0
                  ? "Thread captures or inbox analysis not found yet. Use extension Capture on a LinkedIn thread."
                  : `${m.withMessagingCapture} with thread capture or inbox analysis`
              }
            />
            <CoverageBar
              label="Known connection degree"
              value={Math.max(0, m.withAnyCapture - m.unknownDegree)}
              total={m.withAnyCapture || 1}
              note={
                m.unknownDegree > 0
                  ? `${m.unknownDegree} captured without degree`
                  : undefined
              }
            />
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <MetricTile label="Total contacts" value={m.totalContacts} />
            <MetricTile label="Any capture" value={m.withAnyCapture} />
            <MetricTile
              label="Connections list sync"
              value={m.withConnectionsListCapture}
            />
            <MetricTile label="Profile capture" value={m.withProfileCapture} />
            <MetricTile
              label="High confidence advice"
              value={m.adviceConfidenceHigh}
            />
            <MetricTile
              label="Low confidence advice"
              value={m.adviceConfidenceLow}
            />
          </dl>
        </div>
      </details>

      <details className="clin-card group" open>
        <summary className="cursor-pointer list-none p-5 font-medium [&::-webkit-details-marker]:hidden">
          <span className="clin-section-title">2. Network health</span>
          <p className="mt-1 text-sm font-normal text-[var(--clin-muted)]">
            Structure, segments, activity, threads, removal readiness.
          </p>
        </summary>
        <div className="space-y-6 border-t border-[var(--clin-border)] px-5 pb-5 pt-4">
          <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
            <ChartBlock
              title="Connection degree"
              subtitle={`Only ${m.firstDegreeCount} 1st-degree can disconnect`}
              data={degreeChart}
            />
            <ChartBlock
              title="Segments (rule-based)"
              subtitle={`${m.removeCandidateCount} remove candidates (segment or C≥70)`}
              data={segmentChart}
              pie
            />
          </div>
          <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
            <ChartBlock
              title="LinkedIn activity tier"
              subtitle={`${m.activityUnknown} unknown (no posts capture) — not counted as zombie`}
              data={activityChart}
            />
            <ChartBlock
              title="Thread stages"
              subtitle={
                m.withThreadAnalysis > 0
                  ? `${m.withThreadAnalysis} with thread analysis`
                  : `Capture messaging on 1st-degree contacts to unlock reply metrics`
              }
              data={threadChart}
            />
          </div>
          <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
            <ChartBlock
              title="Remove verdict (in scope)"
              subtitle={`${m.removableFirstYes} yes · ${m.removableFirstMaybe} maybe · queue pending ${m.removalQueuePending}`}
              data={verdictChart}
            />
            <div className="clin-card p-4">
              <h3 className="text-sm font-medium">Score summary</h3>
              <p className="mt-0.5 text-xs text-[var(--clin-muted)]">
                R = last Clin capture, not LinkedIn last active.
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-[var(--clin-muted)]">Avg R</dt>
                  <dd className="text-lg font-semibold tabular-nums">
                    {m.avgRelationshipScore}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--clin-muted)]">Avg C</dt>
                  <dd className="text-lg font-semibold tabular-nums">
                    {m.avgCleanupScore}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--clin-muted)]">
                    Stale capture 120d+
                  </dt>
                  <dd className="text-lg font-semibold tabular-nums">
                    {m.staleCapture120d}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--clin-muted)]">
                    review_remove bucket
                  </dt>
                  <dd className="text-lg font-semibold tabular-nums">
                    {m.reviewRemoveBucket}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </details>

      <details className="clin-card group" open>
        <summary className="cursor-pointer list-none p-5 font-medium [&::-webkit-details-marker]:hidden">
          <span className="clin-section-title">3. Advise + act</span>
          <p className="mt-1 text-sm font-normal text-[var(--clin-muted)]">
            Top removal candidates and numbered next steps from metric gaps.
          </p>
        </summary>
        <div className="space-y-5 border-t border-[var(--clin-border)] px-5 pb-5 pt-4">
          <ol className="list-decimal space-y-3 pl-5 text-sm text-[var(--clin-muted)]">
            {snapshot.actHints.syncConnectionsList ? (
              <li>
                <strong className="clin-strong">Sync connections list</strong> —{" "}
                {m.unknownDegree} captured contact(s) lack degree. Open{" "}
                <a
                  href={snapshot.actHints.connectionsListUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="clin-link"
                >
                  LinkedIn connections
                </a>
                , keep the tab focused, then run{" "}
                <strong className="clin-strong">List sprint</strong> in the
                extension popup.
              </li>
            ) : null}
            <li>
              Analyze{" "}
              <strong className="clin-strong tabular-nums">
                {analyzeEligible}
              </strong>{" "}
              profile-ready contact(s) without LLM (up to 30 per run).
              {analyzeGap > analyzeEligible ? (
                <span className="text-xs text-[var(--clin-muted)]">
                  {" "}
                  ({analyzeGap - analyzeEligible} more have a capture but need
                  name/headline before LLM can run)
                </span>
              ) : null}
              {analyzeEligible > 0 ? (
                <>
                  <button
                    type="button"
                    disabled={busyAction === "analyze"}
                    onClick={() => void runAnalyzeBatch()}
                    className="ml-2 clin-btn-primary text-xs"
                  >
                    {busyAction === "analyze" && analyzeProgress
                      ? analyzeProgress.processed === 0
                        ? `Starting contact 1/${analyzeProgress.target}…`
                        : `Analyzing ${analyzeProgress.processed}/${analyzeProgress.target}…`
                      : busyAction === "analyze"
                        ? "Starting…"
                        : "Run batch"}
                  </button>
                  {analyzeProgress && busyAction === "analyze" ? (
                    <span className="ml-2 text-xs tabular-nums text-[var(--clin-muted)]">
                      {analyzeProgress.succeeded} ok
                      {analyzeProgress.failed
                        ? ` · ${analyzeProgress.failed} failed`
                        : ""}
                      {" · "}
                      ~1–2 min per contact
                    </span>
                  ) : null}
                </>
              ) : null}
            </li>
            <li>
              Queue{" "}
              <strong className="clin-strong tabular-nums">
                {snapshot.actHints.queueRemovalYesCount}
              </strong>{" "}
              disconnect(s) in the{" "}
              <strong className="clin-strong">Review removal</strong> bucket
              (same count as the cleaning board above).
              {snapshot.actHints.queueRemovalYesCount > 0 ? (
                <button
                  type="button"
                  disabled={busyAction === "queue-yes"}
                  onClick={() => void queueRemovals(false)}
                  className="ml-2 clin-btn-primary text-xs"
                >
                  {busyAction === "queue-yes" ? "Queueing…" : "Queue yes"}
                </button>
              ) : null}
              {snapshot.actHints.queueRemovalMaybeCount > 0 ? (
                <>
                  {" "}
                  ·{" "}
                  <button
                    type="button"
                    disabled={busyAction === "queue-maybe"}
                    onClick={() => void queueRemovals(true)}
                    className="clin-link text-xs"
                  >
                    Include {snapshot.actHints.queueRemovalMaybeCount} maybe
                  </button>
                </>
              ) : null}
            </li>
            <li>
              Disconnect on LinkedIn, then confirm in the removal queue below,
              the extension Cleaning tab, or per contact in the table.
            </li>
          </ol>

          {actionError ? <p className="clin-error">{actionError}</p> : null}
          {actionSuccess ? (
            <p className="text-sm text-emerald-700">{actionSuccess}</p>
          ) : null}

          <div className="rounded-lg border border-[var(--clin-border)] bg-[var(--clin-surface-muted)]/40 p-4">
            <p className="text-sm text-[var(--clin-text)]">
              Review and stage removals in the{" "}
              <a href="/cleaning?bucket=review_remove&removal=signals&verdict=maybe" className="clin-link">
                Cleaning board
              </a>
              {" "}above: use <strong className="clin-strong">Review removal</strong> →{" "}
              <strong className="clin-strong">AI signals</strong> for yes/maybe
              filters, then <strong className="clin-strong">Stage for removal</strong>{" "}
              or <strong className="clin-strong">Accept</strong> in the bucket.
            </p>
            <p className="mt-2 text-xs text-[var(--clin-muted)]">
              {m.removableFirstYes} ready yes · {m.removableFirstMaybe} maybe (1st
              degree) · {m.reviewRemoveBucket} already in review_remove bucket
            </p>
          </div>
        </div>
      </details>
    </section>
  );
}

function CoverageBar({
  label,
  value,
  total,
  note,
  overridePct,
}: {
  label: string;
  value: number;
  total: number;
  note?: string;
  overridePct?: number;
}) {
  const p = overridePct ?? pct(value, total);
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="font-medium text-[var(--clin-text)]">{label}</span>
        <span className="tabular-nums text-[var(--clin-muted)]">
          {p}% ({value}/{total})
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-100">
        <div
          className="h-full rounded-full bg-[var(--clin-accent)]"
          style={{ width: `${Math.min(100, p)}%` }}
        />
      </div>
      {note ? (
        <p className="mt-1 text-xs text-amber-800">{note}</p>
      ) : null}
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[var(--clin-border)] px-3 py-2">
      <dt className="text-xs text-[var(--clin-muted)]">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function ChartBlock({
  title,
  subtitle,
  data,
  pie = false,
}: {
  title: string;
  subtitle: string;
  data: { name: string; value: number; fill: string }[];
  pie?: boolean;
}) {
  return (
    <div className="clin-card p-4">
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="mt-0.5 text-xs text-[var(--clin-muted)]">{subtitle}</p>
      {data.length === 0 ? (
        <div className="mt-4 flex h-[220px] w-full items-center justify-center text-sm text-[var(--clin-muted)]">
          No data yet
        </div>
      ) : (
        <ClinChartFrame className="mt-4 h-[220px] w-full min-h-0 min-w-0">
          {pie ? (
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={72}
                paddingAngle={2}
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          ) : (
            <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ClinChartFrame>
      )}
    </div>
  );
}
