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
    <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        Batch LLM analysis
      </h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Picks contacts that already have a{" "}
        <strong className="font-medium text-zinc-800 dark:text-zinc-200">
          profile
        </strong>{" "}
        capture plus name or headline, but no stored analysis yet. Runs Ollama
        sequentially (can take several minutes).
      </p>
      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
        Currently waiting for analysis:{" "}
        <span className="tabular-nums">{pendingCount}</span>
      </p>
      <label className="flex max-w-xs flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-900 dark:text-zinc-100">
          Contacts this run (max 30)
        </span>
        <input
          type="number"
          min={1}
          max={30}
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </label>
      <button
        type="button"
        disabled={busy || pendingCount === 0}
        onClick={() => void runBatch()}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {busy ? "Running…" : "Run batch now"}
      </button>
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}
      {results && results.length > 0 ? (
        <ul className="max-h-64 space-y-1 overflow-y-auto font-mono text-xs text-zinc-700 dark:text-zinc-300">
          {results.map((r) => (
            <li key={r.contactId}>
              {r.ok ? (
                <span className="text-emerald-700 dark:text-emerald-400">
                  ✓ {r.contactId.slice(0, 8)}… ({r.tier})
                </span>
              ) : (
                <span className="text-red-700 dark:text-red-400">
                  ✗ {r.contactId.slice(0, 8)}… {r.error.slice(0, 120)}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {results && results.length === 0 ? (
        <p className="text-sm text-zinc-500">No matching contacts in this batch.</p>
      ) : null}
    </div>
  );
}
