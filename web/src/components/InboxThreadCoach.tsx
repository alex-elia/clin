"use client";

import Link from "next/link";
import { useState } from "react";
import {
  INBOX_ACTION_LABELS,
  type InboxThreadAnalysis,
} from "@/lib/inboxThreadAnalysisTypes";

type Props = {
  contactId: string;
  threadKey: string;
  contactName: string;
  needsReply: boolean;
  messageCount: number;
  captureCount: number;
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

export function InboxThreadCoach({
  contactId,
  threadKey,
  contactName,
  needsReply,
  messageCount,
  captureCount,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<InboxThreadAnalysis | null>(null);
  const [copied, setCopied] = useState(false);

  async function runCoach() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/inbox/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, threadKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || `HTTP ${res.status}`);
        return;
      }
      setAnalysis(data.analysis as InboxThreadAnalysis);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

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

  return (
    <div className="mt-4 space-y-3 border-t border-clin-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-clin-muted">
          {messageCount} messages · {captureCount} capture
          {captureCount === 1 ? "" : "s"}
          {needsReply ? (
            <span className="ml-2 font-medium text-amber-800 dark:text-amber-200">
              · Awaiting your reply
            </span>
          ) : null}
        </p>
        <button
          type="button"
          disabled={loading}
          onClick={() => void runCoach()}
          className="clin-btn-primary text-xs px-3 py-1 disabled:opacity-50"
        >
          {loading ? "Analyzing…" : analysis ? "Re-suggest" : "Suggest reply & action"}
        </button>
      </div>

      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      {analysis ? (
        <div className="space-y-3">
          <div className={`rounded-lg border p-3 ${urgencyClass(analysis.urgency)}`}>
            <p className="text-xs font-medium uppercase tracking-wide opacity-80">
              Recommended · {analysis.urgency} urgency
            </p>
            <p className="mt-1 text-sm font-semibold">
              {INBOX_ACTION_LABELS[analysis.recommended_action]}
            </p>
            <p className="mt-2 text-sm leading-relaxed">{analysis.action_rationale}</p>
          </div>

          <p className="text-sm text-clin-muted">{analysis.thread_summary}</p>

          {analysis.suggested_reply?.trim() ? (
            <div className="rounded-lg border border-clin-border bg-clin-surface-muted/50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-clin-muted">
                  Draft reply for {contactName}
                </p>
                <button
                  type="button"
                  onClick={() => void copyReply()}
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

          {analysis.alternative_actions?.length ? (
            <ul className="list-inside list-disc text-xs text-clin-muted">
              {analysis.alternative_actions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          ) : null}

          {analysis.tone_notes ? (
            <p className="text-xs text-clin-muted">
              <span className="font-medium text-clin-text">Tone:</span>{" "}
              {analysis.tone_notes}
            </p>
          ) : null}

          <p className="text-[11px] text-clin-muted">
            Copy the draft and paste on LinkedIn — Clin never sends messages.{" "}
            <Link href={`/contacts/${contactId}`} className="clin-link">
              Full contact analysis →
            </Link>
          </p>
        </div>
      ) : null}
    </div>
  );
}
