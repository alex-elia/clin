"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  runAnalyzeBatchChunked,
  type AnalyzeBatchProgress,
} from "@/lib/runAnalyzeBatchClient";

type BatchResult =
  | { contactId: string; ok: true; tier: string }
  | { contactId: string; ok: false; error: string };

export function AutopilotBatchPanel({
  defaultLimit,
  pendingCount,
}: {
  defaultLimit: number;
  pendingCount: number;
}) {
  const router = useRouter();
  const [limit, setLimit] = useState(defaultLimit);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<AnalyzeBatchProgress | null>(null);
  const [results, setResults] = useState<BatchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runBatch() {
    setBusy(true);
    setError(null);
    setResults(null);
    setProgress({ target: limit, processed: 0, succeeded: 0, failed: 0 });
    try {
      const summary = await runAnalyzeBatchChunked({
        totalLimit: limit,
        chunkSize: 1,
        onProgress: setProgress,
      });
      setResults(summary.results as BatchResult[]);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="clin-card space-y-4 p-5">
      <h2 className="clin-section-title">Batch LLM analysis</h2>
      <p className="clin-body">
        Picks contacts that already have a{" "}
        <strong className="clin-strong">profile</strong> capture plus name or
        headline, but no stored analysis yet, across the full open network
        (not last month). Each run is capped at 30 because one LLM pass can
        take 1 to 2 minutes per contact. For ICP fit (reach out / skip), fill{" "}
        <a href="/branding/setup?edit=1" className="clin-link">
          goals &amp; positioning
        </a>{" "}
        first.
      </p>
      <p className="text-sm font-medium text-clin-text">
        Currently waiting for analysis:{" "}
        <span className="tabular-nums">{pendingCount}</span>
      </p>
      <label className="flex max-w-xs flex-col gap-1 text-sm">
        <span className="font-medium text-clin-text">
          Contacts this run (max 30)
        </span>
        <input
          type="number"
          min={1}
          max={30}
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="clin-input"
        />
      </label>
      <button
        type="button"
        disabled={busy || pendingCount === 0}
        onClick={() => void runBatch()}
        className="clin-btn-primary"
      >
        {busy && progress
          ? progress.processed === 0
            ? `Starting contact 1/${progress.target}…`
            : `Analyzing ${progress.processed}/${progress.target}…`
          : busy
            ? "Starting…"
            : "Run batch now"}
      </button>
      {progress && busy ? (
        <p className="text-sm text-clin-muted tabular-nums">
          {progress.succeeded} succeeded
          {progress.failed ? ` · ${progress.failed} failed` : ""}. Each contact
          can take 1–2 minutes.
        </p>
      ) : null}
      {error ? <p className="clin-error">{error}</p> : null}
      {results && results.length > 0 ? (
        <ul className="max-h-64 space-y-1 overflow-y-auto font-mono text-xs text-clin-muted">
          {results.map((r, index) => (
            <li key={`${r.contactId}-${index}`}>
              {r.ok ? (
                <span className="text-emerald-700">
                  ✓ {r.contactId.slice(0, 8)}… ({r.tier})
                </span>
              ) : (
                <span className="text-red-700">
                  ✗ {r.contactId.slice(0, 8)}… {r.error.slice(0, 120)}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {results && results.length === 0 ? (
        <p className="clin-body">No matching contacts in this batch.</p>
      ) : null}
    </div>
  );
}
