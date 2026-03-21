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
      <div className="flex flex-wrap gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => setTab("decide")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            tab === "decide"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "text-zinc-600 dark:text-zinc-400"
          }`}
        >
          Decide ({decideCount})
        </button>
        <button
          type="button"
          onClick={() => setTab("ready")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            tab === "ready"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "text-zinc-600 dark:text-zinc-400"
          }`}
        >
          Ready to send ({readyCount})
        </button>
      </div>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {tab === "decide"
          ? "Edit drafts and approve when you are happy. Nothing is sent automatically — you paste on LinkedIn yourself. The extension can read approved rows from GET /api/outreach/ready."
          : "These are approved in Clin. Open LinkedIn, paste your draft, send manually, then mark sent here."}
      </p>

      {list.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {tab === "decide"
            ? "No items waiting for a decision."
            : "Nothing in the ready list. Approve drafts in the Decide tab first."}
        </p>
      ) : (
        <ul className="space-y-6">
          {list.map((it) => (
            <li
              key={it.queueId}
              className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">
                    {it.fullName ?? "Unknown"}
                  </h3>
                  <p className="text-xs text-zinc-500">{it.company ?? "—"}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                    {it.headline ?? ""}
                  </p>
                </div>
                <a
                  href={it.linkedinUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-xs text-blue-600 underline dark:text-blue-400"
                >
                  Open profile
                </a>
              </div>

              {tab === "decide" ? (
                <div className="mt-4 space-y-3">
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Message draft (you send this manually)
                    <textarea
                      className="mt-1 min-h-[140px] w-full rounded-md border border-zinc-300 bg-white p-3 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
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
                      className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-600"
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
                      className="rounded-md px-3 py-1.5 text-xs text-zinc-600 hover:underline dark:text-zinc-400"
                    >
                      Skip outreach
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-zinc-50 p-3 text-sm text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                    {it.draftOutreach?.trim() || "(No draft text)"}
                  </pre>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy === it.queueId}
                      onClick={() =>
                        copyText(it.draftOutreach ?? "")
                      }
                      className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                    >
                      Copy draft
                    </button>
                    <button
                      type="button"
                      disabled={busy === it.queueId}
                      onClick={() => markSent(it.queueId)}
                      className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-600"
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
