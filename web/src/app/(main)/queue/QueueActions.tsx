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
        className="text-xs clin-link"
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

  async function patch(
    id: string,
    body: Record<string, string>,
  ) {
    setBusy(id);
    try {
      const res = await fetch(`/api/queue/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  function isRemovalItem(row: QueueRow): boolean {
    const text = row.queue.suggestedAction?.toLowerCase() ?? "";
    return (
      row.contact.segment === "remove_candidate" ||
      text.includes("disconnect") ||
      text.includes("removal") ||
      text.includes("remove")
    );
  }

  if (items.length === 0) {
    return <p className="text-sm text-clin-muted">Queue is empty.</p>;
  }

  const slice = items.slice(0, visible);
  const remaining = items.length - visible;

  return (
    <div className="space-y-4">
      <p className="text-xs text-clin-muted">
        Showing {slice.length} of {items.length} pending — small batches reduce
        bursty patterns. You still perform every LinkedIn action yourself.
      </p>
      <ul className="space-y-4">
        {slice.map((row) => {
          const { queue, contact } = row;
          const removal = isRemovalItem(row);
          return (
          <li
            key={queue.id}
            className="clin-card p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium text-clin-text">
                  {contact.fullName ?? "Unknown"}
                </p>
                <p className="text-xs text-clin-muted">
                  {contact.segment}
                  <span
                    className={`ms-2 font-mono tabular-nums ${sortMode === "cleanup" ? "text-amber-800 dark:text-amber-200" : "text-clin-muted"}`}
                    title="Cleanup score — higher means stronger signal to review for removal or archive."
                  >
                    · C{contact.cleanupScore}
                  </span>
                </p>
                <p className="mt-2 text-sm text-clin-muted">
                  {queue.suggestedAction ?? "Review this contact."}
                </p>
                <ProfileOpenControl
                  url={contact.linkedinUrlCanonical}
                  minSeconds={minSecondsBetweenProfileOpens}
                  jitterPercent={paceJitterPercent}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {removal ? (
                  <>
                    <button
                      type="button"
                      disabled={busy === queue.id}
                      onClick={() =>
                        patch(queue.id, { removalDecision: "keep" })
                      }
                      className="clin-btn-primary text-xs px-2 py-1 disabled:opacity-50"
                    >
                      Keep connection
                    </button>
                    <button
                      type="button"
                      disabled={busy === queue.id}
                      onClick={() =>
                        patch(queue.id, {
                          removalDecision: "approve_removal",
                        })
                      }
                      className="clin-btn-secondary text-xs px-2 py-1 text-amber-800 dark:text-amber-200 disabled:opacity-50"
                    >
                      Approve removal
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={busy === queue.id}
                    onClick={() => patch(queue.id, { status: "reviewed" })}
                    className="clin-btn-primary text-xs px-2 py-1 disabled:opacity-50"
                  >
                    Reviewed
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy === queue.id}
                  onClick={() => patch(queue.id, { status: "deferred" })}
                  className="clin-btn-secondary text-xs px-2 py-1"
                >
                  Defer
                </button>
                <button
                  type="button"
                  disabled={busy === queue.id}
                  onClick={() => patch(queue.id, { status: "dismissed" })}
                  className="clin-btn-secondary text-xs px-2 py-1 text-clin-muted"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </li>
          );
        })}
      </ul>
      {remaining > 0 ? (
        <button
          type="button"
          onClick={() =>
            setVisible((v) =>
              Math.min(items.length, v + Math.max(1, batchSize)),
            )
          }
          className="clin-btn-secondary text-sm px-3 py-2"
        >
          Load next batch (
          {Math.min(batchSize, remaining)} more · {remaining} left)
        </button>
      ) : null}
    </div>
  );
}
