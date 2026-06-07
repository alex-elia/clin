"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import {
  CLEANING_BUCKET_LABELS,
  outreachFitHeadline,
} from "@/lib/contactLlmDisplay";
import {
  CLEANING_BUCKET_META,
  type CleaningBucket,
} from "@/lib/cleaningBuckets";
import { EXTRACTION_READINESS_LABELS } from "@/lib/contactReadinessShared";
import type {
  CleaningBoardData,
  CleaningContactCard,
} from "@/lib/cleaningBoardTypes";
import { RecommendationPanel } from "@/components/RecommendationPanel";

type BatchResult =
  | { contactId: string; ok: true }
  | { contactId: string; ok: false; error: string };

type Props = {
  data: CleaningBoardData;
};

export function CleaningBoard({ data }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramBucket = searchParams.get("bucket");
  const defaultBucket =
    CLEANING_BUCKET_META.find((m) => (data.summary.bucketCounts[m.id] ?? 0) > 0)
      ?.id ?? "needs_review";
  const active: CleaningBucket =
    paramBucket &&
    CLEANING_BUCKET_META.some((m) => m.id === paramBucket)
      ? (paramBucket as CleaningBucket)
      : defaultBucket;
  const bucketMeta = CLEANING_BUCKET_META.find((m) => m.id === active);
  const cards = data.byBucket[active] ?? [];
  const count = data.summary.bucketCounts[active] ?? 0;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResults, setLastResults] = useState<BatchResult[] | null>(null);

  function selectBucket(id: CleaningBucket) {
    setSelected(new Set());
    const params = new URLSearchParams(searchParams.toString());
    params.set("bucket", id);
    router.push(`/cleaning?${params.toString()}`);
  }

  const toggleSelect = useCallback((contactId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  }, []);

  function selectAllInBucket() {
    setSelected(new Set(cards.map((c) => c.contactId)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function runBatch(
    action:
      | "accept"
      | "override"
      | "dismiss"
      | "defer"
      | "enqueue_review"
      | "enqueue_engage",
    bucket?: CleaningBucket,
  ) {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBusy(true);
    setError(null);
    setLastResults(null);
    try {
      const res = await fetch("/api/cleaning/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: ids, action, bucket }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error || `HTTP ${res.status}`);
        return;
      }
      setLastResults(body.results ?? []);
      setSelected(new Set());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runSingle(
    contactId: string,
    action:
      | "accept"
      | "override"
      | "dismiss"
      | "defer"
      | "enqueue_review"
      | "enqueue_engage",
    bucket?: CleaningBucket,
  ) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/cleaning/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: [contactId], action, bucket }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error || `HTTP ${res.status}`);
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const failedCount = lastResults?.filter((r) => !r.ok).length ?? 0;

  return (
    <div className="space-y-8">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryStat
          label="Ready for analysis"
          value={data.summary.readyForAnalysis}
        />
        <SummaryStat
          label="Waiting for AI run"
          value={data.summary.pendingLlmAnalysis}
        />
        <SummaryStat
          label="Need profile capture"
          value={data.summary.needsProfileCapture}
        />
        <SummaryStat
          label="Analyzed (recent)"
          value={data.summary.analyzedInBoard}
        />
      </dl>

      <section>
        <h2 className="clin-section-title">Buckets</h2>
        <p className="mt-1 text-sm text-[var(--clin-muted)]">
          Contacts are grouped by recommended next step after extraction and AI
          analysis. Counts reflect your most recently updated contacts.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {CLEANING_BUCKET_META.map((meta) => {
            const n = data.summary.bucketCounts[meta.id] ?? 0;
            const selectedBucket = active === meta.id;
            return (
              <button
                key={meta.id}
                type="button"
                onClick={() => selectBucket(meta.id)}
                className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  selectedBucket
                    ? "border-[var(--clin-accent)] bg-[var(--clin-accent)]/10"
                    : "border-[var(--clin-border)] hover:bg-[var(--clin-surface-muted)]"
                }`}
              >
                <span className="font-medium text-[var(--clin-text)]">
                  {meta.title}
                </span>{" "}
                <span className="tabular-nums text-[var(--clin-muted)]">
                  ({n})
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {selected.size > 0 ? (
        <BulkToolbar
          active={active}
          count={selected.size}
          busy={busy}
          onClear={clearSelection}
          onAccept={() => runBatch("accept")}
          onEnqueueReview={() => runBatch("enqueue_review")}
          onEnqueueEngage={() => runBatch("enqueue_engage")}
          onDismiss={() => runBatch("dismiss")}
          onOverride={(bucket) => runBatch("override", bucket)}
        />
      ) : null}

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}
      {lastResults && failedCount > 0 ? (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          {failedCount} contact{failedCount === 1 ? "" : "s"} failed — check
          selection and retry.
        </p>
      ) : null}

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="clin-section-title">{bucketMeta?.title ?? active}</h2>
          {cards.length > 0 ? (
            <button
              type="button"
              onClick={selectAllInBucket}
              className="text-xs clin-link"
            >
              Select all in bucket
            </button>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-[var(--clin-muted)]">
          {bucketMeta?.description}
          {count > cards.length ? (
            <>
              {" "}
              Showing {cards.length} of {count} in this bucket.
            </>
          ) : null}
        </p>
        {cards.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--clin-muted)]">
            No contacts in this bucket among recent records. Run batch analysis or
            import more profiles.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {cards.map((c) => (
              <ContactBucketCard
                key={c.contactId}
                card={c}
                activeBucket={active}
                checked={selected.has(c.contactId)}
                busy={busy}
                onToggle={() => toggleSelect(c.contactId)}
                onAction={(action, bucket) =>
                  runSingle(c.contactId, action, bucket)
                }
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function BulkToolbar({
  active,
  count,
  busy,
  onClear,
  onAccept,
  onEnqueueReview,
  onEnqueueEngage,
  onDismiss,
  onOverride,
}: {
  active: CleaningBucket;
  count: number;
  busy: boolean;
  onClear: () => void;
  onAccept: () => void;
  onEnqueueReview: () => void;
  onEnqueueEngage: () => void;
  onDismiss: () => void;
  onOverride: (bucket: CleaningBucket) => void;
}) {
  const [overrideBucket, setOverrideBucket] = useState<CleaningBucket>(
    "keep_passive",
  );

  return (
    <div className="sticky top-2 z-10 rounded-lg border border-[var(--clin-accent)]/30 bg-[var(--clin-surface)] p-3 shadow-sm">
      <p className="text-sm font-medium text-[var(--clin-text)]">
        {count} selected
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onAccept}
          className="clin-btn-primary text-xs px-2 py-1 disabled:opacity-50"
        >
          Accept &amp; enqueue
        </button>
        {active === "review_remove" ? (
          <button
            type="button"
            disabled={busy}
            onClick={onEnqueueReview}
            className="clin-btn-secondary text-xs px-2 py-1 disabled:opacity-50"
          >
            Send to review queue
          </button>
        ) : null}
        {active === "engage_comment" ? (
          <button
            type="button"
            disabled={busy}
            onClick={onEnqueueEngage}
            className="clin-btn-secondary text-xs px-2 py-1 disabled:opacity-50"
          >
            Add to engage queue
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={onDismiss}
          className="clin-btn-secondary text-xs px-2 py-1 disabled:opacity-50"
        >
          Dismiss
        </button>
        <span className="flex items-center gap-1 text-xs">
          <select
            value={overrideBucket}
            onChange={(e) =>
              setOverrideBucket(e.target.value as CleaningBucket)
            }
            className="rounded border border-[var(--clin-border)] bg-transparent px-1 py-0.5"
          >
            {CLEANING_BUCKET_META.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={() => onOverride(overrideBucket)}
            className="clin-btn-secondary text-xs px-2 py-1 disabled:opacity-50"
          >
            Override all
          </button>
        </span>
        <button
          type="button"
          onClick={onClear}
          className="text-xs clin-link"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="clin-stat">
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--clin-muted)]">
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function ContactBucketCard({
  card,
  activeBucket,
  checked,
  busy,
  onToggle,
  onAction,
}: {
  card: CleaningContactCard;
  activeBucket: CleaningBucket;
  checked: boolean;
  busy: boolean;
  onToggle: () => void;
  onAction: (
    action:
      | "accept"
      | "override"
      | "dismiss"
      | "defer"
      | "enqueue_review"
      | "enqueue_engage",
    bucket?: CleaningBucket,
  ) => void;
}) {
  const [overrideBucket, setOverrideBucket] = useState<CleaningBucket>(
    card.bucket,
  );
  const plan = card.analysis?.cleaningPlan;
  const fit = card.analysis?.outreachFit;
  const playbook =
    plan?.playbook?.trim() ||
    plan?.rationale?.trim() ||
    card.analysis?.stewardship?.rationale;

  return (
    <li className="clin-card p-4">
      <div className="flex flex-wrap items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-1"
          aria-label={`Select ${card.fullName ?? "contact"}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <Link
                href={`/contacts/${card.contactId}`}
                className="font-medium text-[var(--clin-accent)] hover:underline"
              >
                {card.fullName ?? "Unknown"}
              </Link>
              {card.headline ? (
                <p className="mt-0.5 text-sm text-[var(--clin-muted)]">
                  {card.headline}
                </p>
              ) : null}
              {card.company ? (
                <p className="text-xs text-[var(--clin-muted)]">
                  {card.company}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="clin-pill text-xs">
                {CLEANING_BUCKET_LABELS[card.bucket]}
              </span>
              {card.userOverrideBucket ? (
                <span className="clin-pill text-xs text-amber-800 dark:text-amber-200">
                  Your choice
                </span>
              ) : null}
              <span className="clin-pill text-xs">
                {EXTRACTION_READINESS_LABELS[card.readiness.extractionLevel]}
              </span>
              {card.compositeScore != null ? (
                <span className="clin-pill text-xs tabular-nums">
                  Score {card.compositeScore}
                </span>
              ) : null}
            </div>
          </div>
          {card.userOverrideBucket &&
          card.aiBucket &&
          card.userOverrideBucket !== card.aiBucket ? (
            <p className="mt-1 text-xs text-[var(--clin-muted)]">
              AI suggested: {CLEANING_BUCKET_LABELS[card.aiBucket]}
            </p>
          ) : null}
          {fit ? (
            <p className="mt-2 text-sm">
              <span className="font-medium">{outreachFitHeadline(fit)}:</span>{" "}
              {fit.rationale}
            </p>
          ) : null}
          {playbook ? (
            <p className="mt-2 text-sm text-[var(--clin-text)]">{playbook}</p>
          ) : null}
          {card.playbook ? (
            <RecommendationPanel
              playbook={card.playbook}
              className="mt-3"
            />
          ) : null}
          {card.readiness.missing.length > 0 ? (
            <p className="mt-2 text-xs text-[var(--clin-muted)]">
              Missing: {card.readiness.missing.join(" · ")}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <Link href={`/contacts/${card.contactId}`} className="clin-link">
              Open contact
            </Link>
            {card.bucket === "reach_out_dm" ? (
              <Link href="/decisions" className="clin-link">
                Decisions
              </Link>
            ) : null}
            {card.bucket === "review_remove" ? (
              <Link href="/queue" className="clin-link">
                Review queue
              </Link>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--clin-border)] pt-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => onAction("accept")}
              className="clin-btn-primary text-xs px-2 py-1 disabled:opacity-50"
            >
              Accept
            </button>
            {activeBucket === "engage_comment" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onAction("enqueue_engage")}
                className="clin-btn-secondary text-xs px-2 py-1 disabled:opacity-50"
              >
                Engage queue
              </button>
            ) : null}
            {card.queueId ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onAction("defer")}
                className="clin-btn-secondary text-xs px-2 py-1 disabled:opacity-50"
              >
                Defer
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => onAction("dismiss")}
              className="clin-btn-secondary text-xs px-2 py-1 disabled:opacity-50"
            >
              Dismiss
            </button>
            <select
              value={overrideBucket}
              onChange={(e) =>
                setOverrideBucket(e.target.value as CleaningBucket)
              }
              className="rounded border border-[var(--clin-border)] bg-transparent text-xs px-1 py-0.5"
            >
              {CLEANING_BUCKET_META.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy}
              onClick={() => onAction("override", overrideBucket)}
              className="clin-btn-secondary text-xs px-2 py-1 disabled:opacity-50"
            >
              Override
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}
