"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  MANUAL_PASTE_THREAD_KEY,
} from "@/lib/pastedThreadText";
import {
  INBOX_ACTION_LABELS,
  STRATEGY_VERDICT_LABELS,
  THREAD_STAGE_LABELS,
  type InboxThreadAnalysis,
  type ThreadStrategyVerdict,
} from "@/lib/inboxThreadAnalysisTypes";

type StoredAnalysisProps = {
  analysis: InboxThreadAnalysis;
  analyzedAt?: string | null;
  model?: string | null;
  messageCount?: number;
};

type Props = {
  contactId: string;
  threadKey: string;
  contactName: string;
  needsReply: boolean;
  messageCount: number;
  captureCount: number;
  stored?: StoredAnalysisProps | null;
  autoRun?: boolean;
  /** When set, analysis uses pasted text instead of extension capture. */
  pastedThreadText?: string;
};

function urgencyClass(urgency: InboxThreadAnalysis["urgency"]): string {
  if (urgency === "high") {
    return "border-amber-400/60 bg-amber-50/80 text-amber-950 dark:bg-amber-950/35 dark:text-amber-100";
  }
  if (urgency === "medium") {
    return "border-sky-400/50 bg-sky-50/70 text-sky-950 dark:bg-sky-950/30 dark:text-sky-100";
  }
  return "border-clin-border bg-clin-surface-muted text-clin-text";
}

function strategyVerdictClass(verdict: ThreadStrategyVerdict): string {
  if (verdict === "reply_with_draft") {
    return "border-emerald-400/60 bg-emerald-50/90 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100";
  }
  if (verdict === "no_reply") {
    return "border-zinc-300 bg-zinc-100 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-200";
  }
  return "border-violet-400/50 bg-violet-50/80 text-violet-950 dark:bg-violet-950/35 dark:text-violet-100";
}

function AnalysisView({
  analysis,
  contactName,
  analyzedAt,
  model,
  onCopyReply,
  copied,
}: {
  analysis: InboxThreadAnalysis;
  contactName: string;
  analyzedAt?: string | null;
  model?: string | null;
  onCopyReply: () => void;
  copied: boolean;
}) {
  const verdict =
    analysis.strategy_verdict ??
    (analysis.suggested_reply?.trim()
      ? "reply_with_draft"
      : analysis.recommended_action === "no_reply_needed" ||
          analysis.recommended_action === "mark_done"
        ? "no_reply"
        : "other");

  return (
    <div className="space-y-3">
      {analysis.thread_stage ? (
        <p className="text-[11px] font-medium uppercase tracking-wide text-clin-muted">
          Stage: {THREAD_STAGE_LABELS[analysis.thread_stage] ?? analysis.thread_stage}
        </p>
      ) : null}

      <div className={`rounded-lg border p-3 ${strategyVerdictClass(verdict)}`}>
        <p className="text-xs font-medium uppercase tracking-wide opacity-80">
          Strategic advice
        </p>
        <p className="mt-1 text-sm font-semibold">
          {STRATEGY_VERDICT_LABELS[verdict] ?? verdict}
        </p>
        <p className="mt-2 text-sm leading-relaxed">
          {analysis.sales_rationale || analysis.action_rationale}
        </p>
        {analyzedAt ? (
          <p className="mt-2 text-[10px] opacity-70">
            Analyzed {new Date(analyzedAt).toLocaleString()}
            {model ? ` · ${model}` : ""}
          </p>
        ) : null}
      </div>

      <div className={`rounded-lg border p-3 ${urgencyClass(analysis.urgency)}`}>
        <p className="text-xs font-medium uppercase tracking-wide opacity-80">
          Tactical · {analysis.urgency} urgency ·{" "}
          {INBOX_ACTION_LABELS[analysis.recommended_action]}
        </p>
        <p className="mt-2 text-sm leading-relaxed">{analysis.action_rationale}</p>
      </div>

      <p className="text-sm text-clin-muted">{analysis.thread_summary}</p>

      {analysis.suggested_reply?.trim() &&
      verdict === "reply_with_draft" ? (
        <div className="rounded-lg border border-clin-border bg-clin-surface-muted/50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-clin-muted">
              Draft reply for {contactName}
            </p>
            <button
              type="button"
              onClick={onCopyReply}
              className="text-xs text-clin-accent hover:underline"
            >
              {copied ? "Copied" : "Copy draft"}
            </button>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-clin-text">
            {analysis.suggested_reply}
          </p>
        </div>
      ) : null}

      {verdict === "no_reply" ? (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-clin-muted dark:border-zinc-700 dark:bg-zinc-900/40">
          No reply recommended — leave the thread as-is or mark done in Clin.
        </p>
      ) : null}

      {(analysis.alternative_actions?.length || verdict === "other") &&
      analysis.alternative_actions?.length ? (
        <div className="rounded-md border border-violet-200/80 bg-violet-50/50 px-3 py-2 dark:border-violet-900 dark:bg-violet-950/20">
          <p className="text-xs font-semibold text-clin-text">Other options</p>
          <ul className="mt-1 list-inside list-disc text-sm text-clin-muted">
            {analysis.alternative_actions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {analysis.tone_notes ? (
        <p className="text-xs text-clin-muted">
          <span className="font-medium text-clin-text">Tone:</span>{" "}
          {analysis.tone_notes}
        </p>
      ) : null}
    </div>
  );
}

export function InboxThreadCoach({
  contactId,
  threadKey,
  contactName,
  needsReply,
  messageCount,
  captureCount,
  stored,
  autoRun = false,
  pastedThreadText,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<InboxThreadAnalysis | null>(
    stored?.analysis ?? null,
  );
  const [meta, setMeta] = useState<{
    analyzedAt?: string | null;
    model?: string | null;
  }>({
    analyzedAt: stored?.analyzedAt ?? null,
    model: stored?.model ?? null,
  });
  const [copied, setCopied] = useState(false);
  const [autoRan, setAutoRan] = useState(false);

  useEffect(() => {
    if (stored?.analysis) {
      setAnalysis(stored.analysis);
      setMeta({ analyzedAt: stored.analyzedAt, model: stored.model });
    }
  }, [stored?.analysis, stored?.analyzedAt, stored?.model]);

  const runCoach = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const usePaste =
        Boolean(pastedThreadText?.trim()) &&
        threadKey === MANUAL_PASTE_THREAD_KEY;
      const body: Record<string, unknown> = {
        contactId,
        threadKey,
        forceRefresh: force,
      };
      if (usePaste) {
        body.pastedThreadText = pastedThreadText!.trim();
        body.persistPastedThread = true;
      }
      const res = await fetch("/api/inbox/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || `HTTP ${res.status}`);
        return;
      }
      setAnalysis(data.analysis as InboxThreadAnalysis);
      setMeta({
        analyzedAt: new Date().toISOString(),
        model: data.model ?? data.llm?.model ?? null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [contactId, threadKey, pastedThreadText]);

  useEffect(() => {
    if (!autoRun || autoRan || analysis) return;
    const pastedOk = (pastedThreadText?.trim().length ?? 0) >= 40;
    if (!needsReply && messageCount < 2 && !pastedOk) return;
    setAutoRan(true);
    void runCoach(false);
  }, [autoRun, autoRan, analysis, needsReply, messageCount, pastedThreadText, runCoach]);

  async function copyReply() {
    const text = analysis?.suggested_reply?.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard");
    }
  }

  const stale =
    stored?.messageCount != null && stored.messageCount !== messageCount;

  return (
    <div className="mt-4 space-y-3 border-t border-clin-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-clin-muted">
          {messageCount} messages
          {captureCount > 0 ? (
            <>
              {" "}
              · {captureCount} capture
              {captureCount === 1 ? "" : "s"}
            </>
          ) : pastedThreadText?.trim() ? (
            <> · pasted</>
          ) : null}
          {needsReply ? (
            <span className="ml-2 font-medium text-amber-800 dark:text-amber-200">
              · Awaiting your reply
            </span>
          ) : null}
          {loading ? (
            <span className="ml-2 font-medium text-clin-accent">
              · AI analyzing…
            </span>
          ) : null}
        </p>
        <button
          type="button"
          disabled={
            loading ||
            (threadKey === MANUAL_PASTE_THREAD_KEY &&
              (pastedThreadText?.trim().length ?? 0) < 40)
          }
          onClick={() => void runCoach(true)}
          className="clin-btn-primary text-xs px-3 py-1 disabled:opacity-50"
        >
          {loading
            ? "Analyzing…"
            : analysis
              ? stale
                ? "Re-analyze (thread updated)"
                : "Re-analyze"
              : "Analyze thread"}
        </button>
      </div>

      {stale && analysis && !loading ? (
        <p className="text-xs text-amber-800 dark:text-amber-200">
          Thread has new messages since last analysis — click Re-analyze for fresh
          advice.
        </p>
      ) : null}

      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      {analysis ? (
        <>
          <AnalysisView
            analysis={analysis}
            contactName={contactName}
            analyzedAt={meta.analyzedAt}
            model={meta.model}
            onCopyReply={() => void copyReply()}
            copied={copied}
          />
          <p className="text-[11px] text-clin-muted">
            Copy the draft and paste on LinkedIn — Clin never sends messages.{" "}
            <Link href={`/contacts/${contactId}`} className="clin-link">
              Full contact →
            </Link>
          </p>
        </>
      ) : !loading ? (
        <p className="text-xs text-clin-muted">
          Strategic sales analysis runs automatically when you capture a reply
          (Settings → analyze after capture). Or click Analyze thread above.
        </p>
      ) : null}
    </div>
  );
}
