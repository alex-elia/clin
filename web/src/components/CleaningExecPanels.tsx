"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
type BatchResult =
  | { contactId: string; ok: true }
  | { contactId: string; ok: false; error: string };

type Props = {
  engageBucketCount: number;
  removalBucketCount: number;
  engageExecPending: number;
  removalExecPending: number;
  engageContactIds: string[];
};

export function CleaningExecPanels({
  engageBucketCount,
  removalBucketCount,
  engageExecPending,
  removalExecPending,
  engageContactIds,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enqueueEngageBatch() {
    if (engageContactIds.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/cleaning/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactIds: engageContactIds.slice(0, 30),
          action: "enqueue_engage",
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error || `HTTP ${res.status}`);
        return;
      }
      const failed = (body.results as BatchResult[] | undefined)?.filter(
        (r) => !r.ok,
      ).length;
      if (failed) {
        setError(`${failed} contact(s) could not be enqueued.`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="clin-card space-y-3 p-5">
        <h2 className="clin-section-title">Engage batch</h2>
        <p className="text-sm text-[var(--clin-muted)]">
          {engageBucketCount} contact{engageBucketCount === 1 ? "" : "s"} in the
          engage-comment bucket among recent records.{" "}
          {engageExecPending > 0
            ? `${engageExecPending} waiting in the extension engage queue.`
            : "Enqueue contacts, then run Engage in the extension."}
        </p>
        <button
          type="button"
          disabled={busy || engageContactIds.length === 0}
          onClick={() => void enqueueEngageBatch()}
          className="clin-btn-primary text-sm disabled:opacity-50"
        >
          Enqueue up to 30 for engage
        </button>
        <p className="text-xs text-[var(--clin-muted)]">
          Enable the engage runner in{" "}
          <Link href="/settings" className="clin-link">
            Settings
          </Link>
          , then use the extension Cleaning tab.
        </p>
      </div>

      <div className="clin-card space-y-3 p-5">
        <h2 className="clin-section-title">Removal batch</h2>
        <p className="text-sm text-[var(--clin-muted)]">
          {removalBucketCount} contact{removalBucketCount === 1 ? "" : "s"} flagged
          for removal review. After you approve on the{" "}
          <Link href="/queue" className="clin-link">
            review queue
          </Link>
          , {removalExecPending} pending for extension disconnect.
        </p>
        <Link href="/queue" className="clin-btn-secondary inline-block text-sm">
          Open review queue
        </Link>
        <p className="text-xs text-[var(--clin-muted)]">
          Clin opens each profile — you disconnect on LinkedIn and confirm in the
          extension.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400 sm:col-span-2">
          {error}
        </p>
      ) : null}
    </div>
  );
}
