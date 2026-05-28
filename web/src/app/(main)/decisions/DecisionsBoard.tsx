"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type DecisionItem = {
  queueId: string;
  contactId: string;
  fullName: string | null;
  headline: string | null;
  company: string | null;
  linkedinUrl: string;
  suggestedAction: string | null;
  draftOutreach: string | null;
};

type Tab = "decide" | "ready";

export function DecisionsBoard({
  decideItems,
  readyItems,
}: {
  decideItems: DecisionItem[];
  readyItems: DecisionItem[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("decide");
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const it of decideItems) {
      m[it.queueId] =
        it.draftOutreach ??
        (it.suggestedAction
          ? `${it.suggestedAction}\n\n`
          : `Hi ${it.fullName?.split(" ")[0] ?? ""},\n\n`);
    }
    return m;
  });

  const readyCount = readyItems.length;
  const decideCount = decideItems.length;

  async function patch(
    queueId: string,
    body: Record<string, unknown>,
  ) {
    setBusy(queueId);
    try {
      const res = await fetch(`/api/queue/${queueId}`, {
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

  function saveDraft(queueId: string) {
    return patch(queueId, { draftOutreach: drafts[queueId] ?? "" });
  }

  function approveForManualSend(queueId: string) {
    const d = drafts[queueId] ?? "";
    return patch(queueId, { draftOutreach: d, outreachDecision: "approved" });
  }

  function skipOutreach(queueId: string) {
    return patch(queueId, { outreachDecision: "skipped" });
  }

  function markSent(queueId: string) {
    return patch(queueId, { outreachDecision: "sent" });
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("Copy:", text);
    }
  }

  const list = tab === "decide" ? decideItems : readyItems;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 border-b border-clin-border pb-3">
        <button
          type="button"
          onClick={() => setTab("decide")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            tab === "decide"
              ? "clin-tab-active"
              : "text-clin-muted"
          }`}
        >
          Decide ({decideCount})
        </button>
        <button
          type="button"
          onClick={() => setTab("ready")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            tab === "ready"
              ? "clin-tab-active"
              : "text-clin-muted"
          }`}
        >
          Ready to send ({readyCount})
        </button>
      </div>

      <p className="text-sm text-clin-muted">
        {tab === "decide"
          ? "Edit drafts and approve when you are happy. Nothing is sent automatically — you paste on LinkedIn yourself. The extension can read approved rows from GET /api/outreach/ready."
          : "These are approved in Clin. Open LinkedIn, paste your draft, send manually, then mark sent here."}
      </p>

      {list.length === 0 ? (
        <p className="text-sm text-clin-muted">
          {tab === "decide"
            ? "No items waiting for a decision."
            : "Nothing in the ready list. Approve drafts in the Decide tab first."}
        </p>
      ) : (
        <ul className="space-y-6">
          {list.map((it) => (
            <li
              key={it.queueId}
              className="clin-card p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-clin-text">
                    {it.fullName ?? "Unknown"}
                  </h3>
                  <p className="text-xs text-clin-muted">{it.company ?? "—"}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-clin-muted">
                    {it.headline ?? ""}
                  </p>
                </div>
                <a
                  href={it.linkedinUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-xs clin-link"
                >
                  Open profile
                </a>
              </div>

              {tab === "decide" ? (
                <div className="mt-4 space-y-3">
                  <label className="block text-xs font-medium text-clin-muted">
                    Message draft (you send this manually)
                    <textarea
                      className="mt-1 min-h-[140px] w-full clin-input p-3 text-sm"
                      value={drafts[it.queueId] ?? ""}
                      onChange={(e) =>
                        setDrafts((d) => ({
                          ...d,
                          [it.queueId]: e.target.value,
                        }))
                      }
                      disabled={busy === it.queueId}
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy === it.queueId}
                      onClick={() => saveDraft(it.queueId)}
                      className="clin-btn-secondary text-xs px-3 py-1.5"
                    >
                      Save draft
                    </button>
                    <button
                      type="button"
                      disabled={busy === it.queueId}
                      onClick={() => approveForManualSend(it.queueId)}
                      className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800"
                    >
                      Approve for manual send
                    </button>
                    <button
                      type="button"
                      disabled={busy === it.queueId}
                      onClick={() => skipOutreach(it.queueId)}
                      className="clin-link rounded-md px-3 py-1.5 text-xs"
                    >
                      Skip outreach
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-clin-surface-muted p-3 text-sm text-clin-text">
                    {it.draftOutreach?.trim() || "(No draft text)"}
                  </pre>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy === it.queueId}
                      onClick={() =>
                        copyText(it.draftOutreach ?? "")
                      }
                      className="clin-btn-primary text-xs px-3 py-1.5"
                    >
                      Copy draft
                    </button>
                    <button
                      type="button"
                      disabled={busy === it.queueId}
                      onClick={() => markSent(it.queueId)}
                      className="clin-btn-secondary text-xs px-3 py-1.5"
                    >
                      Mark sent (manual)
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
