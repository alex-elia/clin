"use client";

import { useEffect, useState } from "react";
import { preserveCampaignExecScroll } from "@/lib/campaignExecScroll";

type Props = {
  campaignId: string;
  memberId: string;
  initialDraft: string;
  readOnly?: boolean;
};

export function CampaignMemberDraftForm({
  campaignId,
  memberId,
  initialDraft,
  readOnly = false,
}: Props) {
  const [draft, setDraft] = useState(initialDraft);
  const [busy, setBusy] = useState<"save" | "regen" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(initialDraft);
  }, [initialDraft, memberId]);

  const apiBase = `/api/campaigns/${campaignId}/members/${memberId}/draft`;

  async function saveDraft() {
    setBusy("save");
    setError(null);
    setNotice(null);
    preserveCampaignExecScroll(campaignId);
    try {
      const res = await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft }),
      });
      const data = (await res.json()) as { error?: string; draft?: string };
      if (!res.ok) {
        setError(data.error ?? "Save failed.");
        return;
      }
      if (typeof data.draft === "string") setDraft(data.draft);
      setNotice("Saved");
      window.setTimeout(() => setNotice(null), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(null);
    }
  }

  async function regenerateDraft() {
    setBusy("regen");
    setError(null);
    setNotice(null);
    preserveCampaignExecScroll(campaignId);
    try {
      const res = await fetch(apiBase, { method: "POST" });
      const data = (await res.json()) as {
        error?: string;
        draft?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Regenerate failed.");
        return;
      }
      if (typeof data.draft === "string") setDraft(data.draft);
      setNotice("Draft regenerated");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Regenerate failed.");
    } finally {
      setBusy(null);
    }
  }

  if (readOnly) {
    return draft.trim() ? (
      <p className="mt-3 whitespace-pre-wrap rounded-lg border border-clin-border bg-clin-surface-muted/30 p-3 text-sm text-clin-muted">
        {draft}
      </p>
    ) : null;
  }

  return (
    <div className="mt-3 space-y-2">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={5}
        className="w-full clin-input text-sm"
        disabled={busy !== null}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void saveDraft()}
          className="clin-btn-secondary text-xs px-2 py-1 disabled:opacity-50"
        >
          {busy === "save" ? "Saving…" : "Save draft"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void regenerateDraft()}
          className="clin-btn-secondary text-xs px-2 py-1 disabled:opacity-50"
        >
          {busy === "regen" ? "Regenerating…" : "Regenerate (LLM)"}
        </button>
        {notice ? (
          <span className="text-xs text-emerald-700 dark:text-emerald-300">
            {notice}
          </span>
        ) : null}
        {error ? (
          <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
        ) : null}
      </div>
    </div>
  );
}
