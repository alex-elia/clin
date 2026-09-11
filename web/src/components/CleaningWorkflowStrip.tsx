"use client";

import Link from "next/link";

type CleaningWorkflowStripProps = {
  pendingAnalysis: number;
  reviewRemoveBucket: number;
  removalSignals: number;
  removalQueued: number;
  engageQueued: number;
};

export function CleaningWorkflowStrip({
  pendingAnalysis,
  reviewRemoveBucket,
  removalSignals,
  removalQueued,
  engageQueued,
}: CleaningWorkflowStripProps) {
  return (
    <section className="clin-card p-5">
      <h2 className="clin-section-title">Clean your network</h2>
      <p className="mt-1 text-sm text-[var(--clin-muted)]">
        One path: analyze contacts, review buckets (disconnect only for 1st
        degree; invite vs DM for outreach), then run paced work in the extension
        Cleaning tab.
      </p>
      <ol className="mt-4 grid gap-3 lg:grid-cols-3">
        <li className="rounded-lg border border-[var(--clin-border)] p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--clin-muted)]">
            1. Analyze
          </p>
          <p className="mt-1 text-sm text-[var(--clin-text)]">
            <span className="text-lg font-semibold tabular-nums">
              {pendingAnalysis}
            </span>{" "}
            waiting for AI
          </p>
          <a href="#batch-analysis" className="mt-2 inline-block text-sm clin-link">
            Jump to batch analysis
          </a>
        </li>
        <li className="rounded-lg border border-[var(--clin-accent)]/40 bg-[var(--clin-accent)]/5 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--clin-muted)]">
            2. Review &amp; decide
          </p>
          <p className="mt-1 text-sm text-[var(--clin-text)]">
            <span className="font-semibold tabular-nums">{reviewRemoveBucket}</span>{" "}
            in Review removal bucket
            {removalSignals > 0 ? (
              <>
                {" · "}
                <span className="font-semibold tabular-nums">{removalSignals}</span>{" "}
                AI signal(s) not staged yet
              </>
            ) : null}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            <Link
              href="/cleaning?bucket=review_remove&removal=bucket"
              scroll={false}
              className="clin-btn-primary text-xs px-2 py-1"
            >
              Work removals
            </Link>
            {removalSignals > 0 ? (
              <Link
                href="/cleaning?bucket=review_remove&removal=signals&verdict=maybe"
                scroll={false}
                className="clin-btn-secondary text-xs px-2 py-1"
              >
                Review maybe signals
              </Link>
            ) : null}
          </div>
        </li>
        <li className="rounded-lg border border-[var(--clin-border)] p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--clin-muted)]">
            3. Execute on LinkedIn
          </p>
          <p className="mt-1 text-sm text-[var(--clin-text)]">
            <span className="font-semibold tabular-nums">{removalQueued}</span>{" "}
            removal queued ·{" "}
            <span className="font-semibold tabular-nums">{engageQueued}</span>{" "}
            engage queued
          </p>
          <a href="#exec-queues" className="mt-2 inline-block text-sm clin-link">
            Jump to execution queues
          </a>
        </li>
      </ol>
    </section>
  );
}
