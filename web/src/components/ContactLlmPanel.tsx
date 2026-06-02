"use client";

import Link from "next/link";
import { useState } from "react";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import {
  CLEANING_BUCKET_LABELS,
  outreachFitHeadline,
  outreachFitHint,
  pickLatestAnalysisView,
  SUGGESTED_ACTION_LABELS,
  type LlmAnalysisView,
} from "@/lib/contactLlmDisplay";
import { appendTranscriptToText } from "@/lib/speechRecognition";

type Props = {
  contactId: string;
  ruleScores: { r: number; b: number; c: number };
  initialMessage: string;
  messagingCaptureMeta?: {
    messageCount: number;
    capturedAt: string;
    needsReply?: boolean;
  } | null;
  initialProvisional: string | null;
  initialRefined: string | null;
};

function fitPanelClass(
  rec: "reach_out" | "nurture" | "skip" | "unclear",
): string {
  if (rec === "reach_out") {
    return "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/35";
  }
  if (rec === "skip") {
    return "border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/40";
  }
  if (rec === "nurture") {
    return "border-sky-300 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/35";
  }
  return "border-clin-border bg-clin-surface-muted";
}

function stewardshipPanelClass(
  rec: "keep" | "consider_removing" | "unclear",
): string {
  if (rec === "consider_removing") {
    return "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40";
  }
  if (rec === "keep") {
    return "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/35";
  }
  return "border-clin-border bg-clin-surface-muted";
}

export function ContactLlmPanel({
  contactId,
  ruleScores,
  initialMessage,
  messagingCaptureMeta,
  initialProvisional,
  initialRefined,
}: Props) {
  const [message, setMessage] = useState(initialMessage);
  const [tier, setTier] = useState<"auto" | "provisional" | "refined">("auto");
  const [persist, setPersist] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provisional, setProvisional] = useState(initialProvisional);
  const [refined, setRefined] = useState(initialRefined);
  const [lastEnvelope, setLastEnvelope] = useState<unknown>(null);
  const [showMessaging, setShowMessaging] = useState(
    Boolean(messagingCaptureMeta) || initialMessage.trim().length > 0,
  );
  const [showTechnical, setShowTechnical] = useState(false);

  const analysis = pickLatestAnalysisView(
    lastEnvelope,
    tryParseJson(refined ?? ""),
    tryParseJson(provisional ?? ""),
  );

  async function runAnalysis() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/contacts/${contactId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier,
          messageContext: message,
          persistMessageContext: persist,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || `HTTP ${res.status}`);
        return;
      }
      if (data?.envelope) setLastEnvelope(data.envelope);
      const c = data.contact as {
        llmProvisionalJson?: string | null;
        llmRefinedJson?: string | null;
        llmMessageContext?: string | null;
      };
      if (c.llmProvisionalJson !== undefined) setProvisional(c.llmProvisionalJson);
      if (c.llmRefinedJson !== undefined) setRefined(c.llmRefinedJson);
      if (persist && typeof c.llmMessageContext === "string") {
        setMessage(c.llmMessageContext);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const hasAnalysis = Boolean(analysis?.outreachFit || analysis?.rationale);

  return (
    <section className="space-y-6">
      <div className="clin-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="clin-section-title">AI insight</h2>
            <p className="mt-1 text-sm text-clin-muted">
              Fit vs your offer and relationship signals. Use{" "}
              <strong className="clin-strong">What to do next</strong> above to
              message or add to a campaign.
            </p>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={() => void runAnalysis()}
            className="clin-btn-primary shrink-0 text-sm disabled:opacity-50"
          >
            {loading ? "Analyzing…" : analysis ? "Re-run analysis" : "Run analysis"}
          </button>
        </div>

        {error ? (
          <p className="mt-3 whitespace-pre-wrap text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}

        {!hasAnalysis && !loading ? (
          <p className="mt-4 rounded-lg border border-dashed border-clin-border px-4 py-6 text-center text-sm text-clin-muted">
            No analysis yet. Capture a full profile, fill{" "}
            <Link href="/branding/setup?edit=1" className="clin-link">
              goals &amp; offer
            </Link>
            , then run analysis.
          </p>
        ) : null}

        {analysis?.outreachFit ? (
          <div
            className={`mt-4 rounded-lg border p-4 ${fitPanelClass(analysis.outreachFit.recommendation)}`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-clin-muted">
              Recommendation
            </p>
            <p className="mt-1 text-xl font-semibold text-clin-text">
              {outreachFitHeadline(analysis.outreachFit)}
            </p>
            <p className="mt-1 text-sm text-clin-muted">
              {outreachFitHint(analysis.outreachFit)}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-clin-text">
              {analysis.outreachFit.rationale}
            </p>
            {analysis.outreachFit.icp_signals?.length ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-clin-muted">
                {analysis.outreachFit.icp_signals.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {analysis?.cleaningPlan ? (
          <div className="mt-4 rounded-lg border border-[var(--clin-border)] bg-[var(--clin-surface-muted)]/60 p-4">
            <p className="text-sm font-semibold text-[var(--clin-text)]">
              Cleaning bucket:{" "}
              {CLEANING_BUCKET_LABELS[analysis.cleaningPlan.bucket]}
              <span className="ml-2 font-normal text-[var(--clin-muted)]">
                ({analysis.cleaningPlan.confidence} confidence)
              </span>
            </p>
            <p className="mt-2 text-sm text-[var(--clin-muted)]">
              {analysis.cleaningPlan.rationale}
            </p>
            {analysis.cleaningPlan.playbook ? (
              <p className="mt-2 text-sm text-[var(--clin-text)]">
                <strong className="font-medium">Next step:</strong>{" "}
                {analysis.cleaningPlan.playbook}
              </p>
            ) : null}
            <Link
              href="/cleaning"
              className="mt-2 inline-block text-sm text-[var(--clin-accent)] hover:underline"
            >
              View all buckets →
            </Link>
          </div>
        ) : null}

        {analysis?.rationale &&
        (analysis.rationale.business ||
          analysis.rationale.relationship ||
          analysis.rationale.cleanup) ? (
          <dl className="mt-4 space-y-3 text-sm">
            {analysis.rationale.business ? (
              <div>
                <dt className="font-medium text-clin-text">Business</dt>
                <dd className="mt-0.5 text-clin-muted">
                  {analysis.rationale.business}
                </dd>
              </div>
            ) : null}
            {analysis.rationale.relationship ? (
              <div>
                <dt className="font-medium text-clin-text">Relationship</dt>
                <dd className="mt-0.5 text-clin-muted">
                  {analysis.rationale.relationship}
                </dd>
              </div>
            ) : null}
            {analysis.rationale.cleanup ? (
              <div>
                <dt className="font-medium text-clin-text">Network hygiene</dt>
                <dd className="mt-0.5 text-clin-muted">
                  {analysis.rationale.cleanup}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {analysis?.suggestedActions.length ? (
          <ul className="mt-4 space-y-1 text-sm text-clin-muted">
            {analysis.suggestedActions.map((a) => (
              <li key={a}>
                {SUGGESTED_ACTION_LABELS[a] ?? a}
              </li>
            ))}
          </ul>
        ) : null}

        {analysis?.dataGaps.length ? (
          <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
            <strong className="font-medium">Missing for confidence:</strong>{" "}
            {analysis.dataGaps.join(" · ")}
          </p>
        ) : null}

        <details className="mt-4 text-xs text-clin-muted">
          <summary className="cursor-pointer font-medium text-clin-text">
            What do R / B / C mean?
          </summary>
          <p className="mt-2 leading-relaxed">
            <strong>R{ruleScores.r}</strong> — how recently you captured this person.{" "}
            <strong>B{ruleScores.b}</strong> — rough keyword match to business roles
            (not AI). <strong>C{ruleScores.c}</strong> — stale or thin profile in Clin.
            Segment tags use these until you override.
          </p>
        </details>

        {analysis?.analyzedAt ? (
          <p className="mt-3 text-[11px] text-clin-muted">
            Last run: {new Date(analysis.analyzedAt).toLocaleString()}
            {analysis.tier ? ` · ${analysis.tier}` : ""}
            {analysis.model ? ` · ${analysis.model}` : ""}
          </p>
        ) : null}

        <details
          className="mt-4"
          open={showTechnical}
          onToggle={(e) => setShowTechnical(e.currentTarget.open)}
        >
          <summary className="cursor-pointer text-xs font-medium text-clin-muted">
            Technical details (raw JSON)
          </summary>
          <div className="mt-2 grid gap-4 lg:grid-cols-2">
            <pre className="max-h-48 overflow-auto rounded-md bg-clin-navy p-3 text-[10px] text-white">
              {prettyJson(refined) || "—"}
            </pre>
            <pre className="max-h-48 overflow-auto rounded-md bg-clin-navy p-3 text-[10px] text-white">
              {prettyJson(provisional) || "—"}
            </pre>
          </div>
          <label className="mt-3 block space-y-1 text-sm">
            <span className="text-clin-muted">Analysis tier</span>
            <select
              value={tier}
              onChange={(e) =>
                setTier(e.target.value as "auto" | "provisional" | "refined")
              }
              className="clin-input w-full max-w-md"
            >
              <option value="auto">Auto</option>
              <option value="provisional">Provisional (thin data)</option>
              <option value="refined">Refined (profile + messages)</option>
            </select>
          </label>
        </details>
      </div>

      <details className="clin-card p-5" open={showMessaging}>
        <summary
          className="cursor-pointer text-sm font-semibold text-clin-text"
          onClick={() => setShowMessaging((v) => !v)}
        >
          Message thread (optional — reply advice & stewardship)
        </summary>
        <div className="mt-4 space-y-4">
          <p className="text-xs text-clin-muted">
            Extension → Messaging on an open LinkedIn thread, or paste below.
            Merged captures fill this automatically. Use{" "}
            <Link href="/inbox" className="clin-link">
              Inbox
            </Link>{" "}
            for reply drafts and suggested actions.
          </p>
          {messagingCaptureMeta ? (
            <p className="rounded-md border border-emerald-400/40 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100">
              Loaded {messagingCaptureMeta.messageCount} messages from merged captures (
              {new Date(messagingCaptureMeta.capturedAt).toLocaleString()}).
              {messagingCaptureMeta.needsReply ? (
                <span className="ml-1 font-medium text-amber-900 dark:text-amber-200">
                  Their last message is unanswered.
                </span>
              ) : null}
            </p>
          ) : null}
          <div className="clin-voice-field">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={8}
              placeholder="Paste DM thread…"
              className="min-h-0 flex-1 w-full clin-input font-mono text-xs"
            />
            <VoiceInputButton
              size="sm"
              label="Voice"
              onAppend={(text) =>
                setMessage((m) => appendTranscriptToText(m, text))
              }
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-clin-muted">
            <input
              type="checkbox"
              checked={persist}
              onChange={(e) => setPersist(e.target.checked)}
            />
            Save thread on this contact
          </label>
          {analysis?.stewardship ? (
            <div
              className={`rounded-lg border p-4 ${stewardshipPanelClass(analysis.stewardship.recommendation)}`}
            >
              <p className="text-sm font-semibold text-clin-text">
                {analysis.stewardship.recommendation === "consider_removing"
                  ? "Lean: consider removing"
                  : analysis.stewardship.recommendation === "keep"
                    ? "Lean: worth keeping"
                    : "Unclear from thread"}
              </p>
              <p className="mt-2 text-sm">{analysis.stewardship.rationale}</p>
            </div>
          ) : null}
          {analysis?.messageRead ? (
            <p className="text-sm text-clin-muted">
              <strong className="text-clin-text">Thread read:</strong>{" "}
              {analysis.messageRead}
            </p>
          ) : null}
        </div>
      </details>
    </section>
  );
}

function prettyJson(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
