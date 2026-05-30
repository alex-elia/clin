"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
  const [results, setResults] = useState<BatchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runBatch() {
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/autopilot/analyze-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || `HTTP ${res.status}`);
        return;
      }
      setResults(data.results ?? []);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="clin-card space-y-4 p-5">
      <h2 className="clin-section-title">Batch LLM analysis</h2>
      <p className="clin-body">
        Picks contacts that already have a{" "}
        <strong className="clin-strong">profile</strong> capture plus name or
        headline, but no stored analysis yet. Runs inference sequentially (can take
        several minutes).
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
        {busy ? "Running…" : "Run batch now"}
      </button>
      {error ? <p className="clin-error">{error}</p> : null}
      {results && results.length > 0 ? (
        <ul className="max-h-64 space-y-1 overflow-y-auto font-mono text-xs text-clin-muted">
          {results.map((r) => (
            <li key={r.contactId}>
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
