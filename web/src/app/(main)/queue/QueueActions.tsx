"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type QueueRow = {
  queue: {
    id: string;
    suggestedAction: string | null;
    priority: number;
  };
  contact: {
    id: string;
    fullName: string | null;
    linkedinUrlCanonical: string;
    segment: string;
    cleanupScore: number;
  };
};

const OPEN_LAST_KEY = "clin_last_profile_open_ms";
const OPEN_GAP_KEY = "clin_profile_open_required_gap_ms";

function nextClientGapMs(minMs: number, jitterPercent: number): number {
  const jitter = Math.max(0, Math.min(100, Math.floor(jitterPercent)));
  if (jitter === 0) return Math.round(minMs);
  const extraMax = Math.floor((minMs * jitter) / 100);
  const extra =
    extraMax <= 0 ? 0 : Math.floor(Math.random() * (extraMax + 1));
  return Math.round(minMs + extra);
}

function ProfileOpenControl({
  url,
  minSeconds,
  jitterPercent,
}: {
  url: string;
  minSeconds: number;
  jitterPercent: number;
}) {
  const [waitSec, setWaitSec] = useState(0);

  useEffect(() => {
    if (waitSec <= 0) return;
    const t = window.setInterval(
      () => setWaitSec((w) => Math.max(0, w - 1)),
      1000,
    );
    return () => window.clearInterval(t);
  }, [waitSec]);

  function openProfile() {
    const last = Number(sessionStorage.getItem(OPEN_LAST_KEY) || "0");
    const minMs = minSeconds * 1000;
    const storedGap = Number(sessionStorage.getItem(OPEN_GAP_KEY) || "0");
    const requiredMs = Math.max(
      Number.isFinite(storedGap) && storedGap > 0 ? storedGap : minMs,
      minMs,
    );
    const delta = Date.now() - last;
    if (last > 0 && delta < requiredMs) {
      setWaitSec(Math.max(1, Math.ceil((requiredMs - delta) / 1000)));
      return;
    }
    sessionStorage.setItem(OPEN_LAST_KEY, String(Date.now()));
    sessionStorage.setItem(
      OPEN_GAP_KEY,
      String(nextClientGapMs(minMs, jitterPercent)),
    );
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="mt-2 space-y-1">
      <button
        type="button"
        onClick={openProfile}
        className="text-xs text-blue-600 underline dark:text-blue-400"
      >
        Open LinkedIn profile (manual)
      </button>
      {waitSec > 0 ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Paced: wait {waitSec}s between profile opens (local rule, jittered).
        </p>
      ) : null}
    </div>
  );
}

export function QueueActions({
  items,
  batchSize,
  minSecondsBetweenProfileOpens,
  paceJitterPercent,
  sortMode,
}: {
  items: QueueRow[];
  batchSize: number;
  minSecondsBetweenProfileOpens: number;
  paceJitterPercent: number;
  sortMode: "priority" | "cleanup";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [visible, setVisible] = useState(() =>
    Math.min(Math.max(1, batchSize), Math.max(items.length, 1)),
  );

  useEffect(() => {
    setVisible(Math.min(Math.max(1, batchSize), Math.max(items.length, 1)));
  }, [items, batchSize]);

  async function patch(id: string, status: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/queue/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">Queue is empty.</p>;
  }

  const slice = items.slice(0, visible);
  const remaining = items.length - visible;

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        Showing {slice.length} of {items.length} pending — small batches reduce
        bursty patterns. You still perform every LinkedIn action yourself.
      </p>
      <ul className="space-y-4">
        {slice.map(({ queue, contact }) => (
          <li
            key={queue.id}
            className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-100">
                  {contact.fullName ?? "Unknown"}
                </p>
                <p className="text-xs text-zinc-500">
                  {contact.segment}
                  <span
                    className={`ms-2 font-mono tabular-nums ${sortMode === "cleanup" ? "text-amber-800 dark:text-amber-200" : "text-zinc-400"}`}
                    title="Cleanup score — higher means stronger signal to review for removal or archive."
                  >
                    · C{contact.cleanupScore}
                  </span>
                </p>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                  {queue.suggestedAction ?? "Review this contact."}
                </p>
                <ProfileOpenControl
                  url={contact.linkedinUrlCanonical}
                  minSeconds={minSecondsBetweenProfileOpens}
                  jitterPercent={paceJitterPercent}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy === queue.id}
                  onClick={() => patch(queue.id, "reviewed")}
                  className="rounded-md bg-zinc-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  Reviewed
                </button>
                <button
                  type="button"
                  disabled={busy === queue.id}
                  onClick={() => patch(queue.id, "deferred")}
                  className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600"
                >
                  Defer
                </button>
                <button
                  type="button"
                  disabled={busy === queue.id}
                  onClick={() => patch(queue.id, "dismissed")}
                  className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-600 dark:border-zinc-600 dark:text-zinc-400"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {remaining > 0 ? (
        <button
          type="button"
          onClick={() =>
            setVisible((v) =>
              Math.min(items.length, v + Math.max(1, batchSize)),
            )
          }
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600"
        >
          Load next batch (
          {Math.min(batchSize, remaining)} more · {remaining} left)
        </button>
      ) : null}
    </div>
  );
}
