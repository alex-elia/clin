"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { preserveCampaignExecScroll } from "@/lib/campaignExecScroll";
import { INVITE_NOTE_MAX_CHARS, isUsableOutreachCopy } from "@/lib/outreachInviteWorkflow";

type Props = {
  campaignId: string;
  memberId: string;
  initialDraft: string;
  kind?: "invite" | "followup";
  label?: string;
  readOnly?: boolean;
  lockedHint?: string | null;
  collapsed?: boolean;
};

export function CampaignMemberDraftForm({
  campaignId,
  memberId,
  initialDraft,
  kind = "followup",
  label,
  readOnly = false,
  lockedHint = null,
  collapsed = false,
}: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState(initialDraft);
  const [busy, setBusy] = useState<"save" | "regen" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    setDraft(isUsableOutreachCopy(initialDraft) ? initialDraft : "");
  }, [initialDraft, memberId, kind]);

  useEffect(() => {
    if (busy !== "regen") {
      setElapsedSec(0);
      return;
    }
    const started = Date.now();
    const id = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [busy]);

  const apiBase = `/api/campaigns/${campaignId}/members/${memberId}/draft`;
  const maxChars = kind === "invite" ? INVITE_NOTE_MAX_CHARS : undefined;
  const overLimit = maxChars != null && draft.trim().length > maxChars;
  const empty = !isUsableOutreachCopy(draft);
  const generateLabel =
    kind === "invite"
      ? empty
        ? "Generate invite note"
        : "Regenerate invite note"
      : empty
        ? "Generate DM"
        : "Regenerate DM";

  async function saveDraft() {
    setBusy("save");
    setError(null);
    setNotice(null);
    preserveCampaignExecScroll(campaignId);
    try {
      const res = await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft, kind }),
        signal: AbortSignal.timeout(30_000),
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
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
        signal: AbortSignal.timeout(kind === "invite" ? 110_000 : 100_000),
      });
      const data = (await res.json()) as {
        error?: string;
        draft?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Generate failed.");
        return;
      }
      if (typeof data.draft === "string") setDraft(data.draft);
      setNotice(
        kind === "invite" ? "Invite note generated" : "Follow-up DM generated",
      );
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Generate failed.";
      setError(
        msg.toLowerCase().includes("abort") || msg.toLowerCase().includes("timeout")
          ? "Generate timed out. Try again."
          : msg,
      );
    } finally {
      setBusy(null);
    }
  }

  const editor = readOnly ? (
    !label && !lockedHint && empty ? null : (
      <div className="mt-3">
        {label && !collapsed ? (
          <p className="mb-1 text-xs font-medium text-clin-muted">{label}</p>
        ) : null}
        {lockedHint ? (
          <p className="mb-1 text-xs text-clin-muted">{lockedHint}</p>
        ) : null}
        {draft.trim() ? (
          <p className="whitespace-pre-wrap rounded-lg border border-clin-border bg-clin-surface-muted/30 p-3 text-sm text-clin-muted">
            {draft}
          </p>
        ) : null}
      </div>
    )
  ) : (
    <div className="mt-3 space-y-2">
      {label && !collapsed ? (
        <p className="text-xs font-medium text-[var(--clin-text)]">{label}</p>
      ) : null}
      {kind === "invite" ? (
        <p className="text-xs text-clin-muted">
          This is the LinkedIn Connect note (max {INVITE_NOTE_MAX_CHARS}{" "}
          characters on a free account). Generate or edit it here. You do not need to regenerate
          the follow-up DM until they accept.
        </p>
      ) : null}
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={kind === "invite" ? 4 : 5}
        className="w-full clin-input text-sm"
        disabled={busy !== null}
        placeholder={
          kind === "invite"
            ? "Generate an invite note, or type one (max 200 characters)."
            : undefined
        }
      />
      {maxChars != null ? (
        <p
          className={`text-xs ${overLimit ? "text-red-600 dark:text-red-400" : "text-clin-muted"}`}
        >
          {draft.trim().length} / {maxChars} characters
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void regenerateDraft()}
          className={
            kind === "invite"
              ? "clin-btn-primary text-xs px-2 py-1 disabled:opacity-50"
              : "clin-btn-secondary text-xs px-2 py-1 disabled:opacity-50"
          }
        >
          {busy === "regen"
            ? `Generating… ${elapsedSec}s`
            : generateLabel}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void saveDraft()}
          className="clin-btn-secondary text-xs px-2 py-1 disabled:opacity-50"
        >
          {busy === "save" ? "Saving…" : "Save draft"}
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
      {busy === "regen" ? (
        <p className="text-xs text-clin-muted">
          {kind === "invite"
            ? "Stay on this page. Invite notes use the fast model from Settings. This usually finishes in a few seconds."
            : "Stay on this page. Generating a DM can take up to about a minute."}
        </p>
      ) : null}
    </div>
  );

  if (!editor) return null;

  if (collapsed) {
    return (
      <details className="mt-3 rounded-lg border border-clin-border px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-clin-muted">
          {label ?? "Follow-up DM"} (waiting, not used yet)
        </summary>
        <div className="pb-1">{editor}</div>
      </details>
    );
  }

  return editor;
}
