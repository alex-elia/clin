"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { CleaningExecListItem } from "@/lib/cleaningExecQueueList";

type Props = {
  initialEngage: CleaningExecListItem[];
  initialRemoval: CleaningExecListItem[];
};

export function CleaningExecQueuePanel({
  initialEngage,
  initialRemoval,
}: Props) {
  const router = useRouter();
  const [engage, setEngage] = useState(initialEngage);
  const [removal, setRemoval] = useState(initialRemoval);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const item of initialEngage) {
      if (item.suggestedComment) map[item.execId] = item.suggestedComment;
    }
    return map;
  });

  const refresh = useCallback(async () => {
    const res = await fetch("/api/cleaning/exec-queue");
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return;
    setEngage(body.engage ?? []);
    setRemoval(body.removal ?? []);
    const map: Record<string, string> = {};
    for (const item of body.engage ?? []) {
      if (item.suggestedComment) map[item.execId] = item.suggestedComment;
    }
    setDrafts(map);
    router.refresh();
  }, [router]);

  async function patchItem(
    execId: string,
    patch: {
      suggestedComment?: string;
      skip?: boolean;
      regenerateComment?: boolean;
      markDisconnected?: boolean;
    },
  ) {
    setBusyId(execId);
    setError(null);
    try {
      const res = await fetch(`/api/cleaning/exec-queue/${execId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error || `HTTP ${res.status}`);
        return;
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-8">
      <div>
        <h2 className="clin-section-title">Exec queues</h2>
        <p className="mt-1 text-sm text-[var(--clin-muted)]">
          Contacts you accepted from cleaning appear here until the extension
          marks them done. Edit comments before running engage in the extension.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      <EngageQueueSection
        items={engage}
        drafts={drafts}
        busyId={busyId}
        onDraftChange={(execId, value) =>
          setDrafts((prev) => ({ ...prev, [execId]: value }))
        }
        onSave={(execId) =>
          patchItem(execId, { suggestedComment: drafts[execId] ?? "" })
        }
        onRegenerate={(execId) => patchItem(execId, { regenerateComment: true })}
        onSkip={(execId) => patchItem(execId, { skip: true })}
      />

      <RemovalQueueSection
        items={removal}
        busyId={busyId}
        onSkip={(execId) => patchItem(execId, { skip: true })}
        onConfirmDisconnected={(execId) =>
          patchItem(execId, { markDisconnected: true })
        }
      />
    </section>
  );
}

function EngageQueueSection({
  items,
  drafts,
  busyId,
  onDraftChange,
  onSave,
  onRegenerate,
  onSkip,
}: {
  items: CleaningExecListItem[];
  drafts: Record<string, string>;
  busyId: string | null;
  onDraftChange: (execId: string, value: string) => void;
  onSave: (execId: string) => void;
  onRegenerate: (execId: string) => void;
  onSkip: (execId: string) => void;
}) {
  return (
    <div className="clin-card space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-[var(--clin-text)]">
          Engage queue ({items.length})
        </h3>
        <p className="text-xs text-[var(--clin-muted)]">
          Also visible in extension → Cleaning tab
        </p>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-[var(--clin-muted)]">
          No pending engage tasks. Accept contacts in the engage bucket above.
        </p>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => {
            const busy = busyId === item.execId;
            const draft = drafts[item.execId] ?? item.suggestedComment ?? "";
            return (
              <li
                key={item.execId}
                className="rounded-lg border border-[var(--clin-border)] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link
                      href={`/contacts/${item.contactId}`}
                      className="font-medium text-[var(--clin-accent)] hover:underline"
                    >
                      {item.fullName ?? "Unknown"}
                    </Link>
                    {item.headline ? (
                      <p className="text-xs text-[var(--clin-muted)]">
                        {item.headline}
                      </p>
                    ) : null}
                  </div>
                  {item.activityUrl ? (
                    <a
                      href={item.activityUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="clin-link text-xs"
                    >
                      Open activity
                    </a>
                  ) : null}
                </div>

                {item.targetPostPreview ? (
                  <div className="mt-3 rounded-md bg-[var(--clin-surface-muted)] p-3 text-sm">
                    <p className="text-xs font-medium uppercase tracking-wide text-[var(--clin-muted)]">
                      Post to comment on
                      {item.targetPostAge ? ` · ${item.targetPostAge}` : ""}
                      {item.targetPostKind && item.targetPostKind !== "original"
                        ? ` · ${item.targetPostKind === "news_share" ? "shared article" : "reshare"}`
                        : ""}
                    </p>
                    <p className="mt-1 text-[var(--clin-text)]">
                      {item.targetPostPreview}
                    </p>
                    {item.targetPostKind &&
                    item.targetPostKind !== "original" ? (
                      <p className="mt-2 text-xs text-[var(--clin-muted)]">
                        Interest signal — not their original writing. Comment on
                        their take or the topic, not as if they authored the
                        article.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                    No posts within the last year captured — comment on a recent
                    post manually, or capture fresh activity on LinkedIn.
                  </p>
                )}

                <label className="mt-3 block text-xs font-medium text-[var(--clin-muted)]">
                  Comment to paste
                  <textarea
                    value={draft}
                    onChange={(e) => onDraftChange(item.execId, e.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-md border border-[var(--clin-border)] bg-transparent px-3 py-2 text-sm"
                  />
                </label>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy || !draft.trim()}
                    onClick={() => onSave(item.execId)}
                    className="clin-btn-primary text-xs px-2 py-1 disabled:opacity-50"
                  >
                    Save comment
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onRegenerate(item.execId)}
                    className="clin-btn-secondary text-xs px-2 py-1 disabled:opacity-50"
                  >
                    Regenerate AI
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onSkip(item.execId)}
                    className="clin-btn-secondary text-xs px-2 py-1 disabled:opacity-50"
                  >
                    Remove from queue
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function RemovalQueueSection({
  items,
  busyId,
  onSkip,
  onConfirmDisconnected,
}: {
  items: CleaningExecListItem[];
  busyId: string | null;
  onSkip: (execId: string) => void;
  onConfirmDisconnected: (execId: string) => void;
}) {
  return (
    <div className="clin-card space-y-4 p-5">
      <h3 className="font-medium text-[var(--clin-text)]">
        Removal queue ({items.length})
      </h3>
      <p className="text-xs text-[var(--clin-muted)]">
        After disconnecting on LinkedIn, confirm here or in the extension
        Cleaning tab.
      </p>

      {items.length === 0 ? (
        <p className="text-sm text-[var(--clin-muted)]">
          No pending removals. Accept contacts in the review-remove bucket above.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const busy = busyId === item.execId;
            return (
              <li
                key={item.execId}
                className="rounded-lg border border-[var(--clin-border)] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link
                      href={`/contacts/${item.contactId}`}
                      className="font-medium text-[var(--clin-accent)] hover:underline"
                    >
                      {item.fullName ?? "Unknown"}
                    </Link>
                    {item.rationale ? (
                      <p className="mt-1 text-sm text-[var(--clin-muted)]">
                        {item.rationale}
                      </p>
                    ) : null}
                  </div>
                  {item.linkedinUrl ? (
                    <a
                      href={item.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="clin-link text-xs"
                    >
                      Open profile
                    </a>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onConfirmDisconnected(item.execId)}
                    className="clin-btn-primary text-xs px-2 py-1 disabled:opacity-50"
                  >
                    I disconnected on LinkedIn
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onSkip(item.execId)}
                    className="clin-btn-secondary text-xs px-2 py-1 disabled:opacity-50"
                  >
                    Remove from queue
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
